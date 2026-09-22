// backend/utils/anticiposAlFacturar.js
//
// Cancelación automática de los anticipos (y remisiones) de las órdenes que se
// facturan: al generar el CFDI dejan de tener sentido como comprobante de cobro
// aparte y se enlazan a la factura (pago.facturaId). Vivía dentro de
// routes/generar_xml.js; se movió aquí, sin cambiar la mecánica de las facturas
// normales, para reutilizarla en la Factura Global y poder probarla aparte.

const Vehiculo = require("../models/Vehiculo");
const Cliente = require("../models/Cliente");
const AnticipoCliente = require("../models/AnticipoCliente");
const { sincronizarFechaPagadaRemisiones } = require("./cajaTotales");
const { datosMovimientosTerminal, moverTerminalesDePago } = require("./movimientosTerminalPago");
const { cancelarDeposito, revertirUso, SaldoInsuficienteError } = require("./anticiposCliente");

// Un Abono capturado sobre una orden con Remisión a Crédito es, en el fondo,
// un anticipo: el cliente pagó antes de que la orden se facturara — solo que
// el cajero usó "Abonar" (no "Anticipo") porque la orden ya tenía un
// comprobante (la Remisión). Sin esto, ese pago nunca aparecía en el Reporte
// de Facturas (ni vigente ni cancelado) y quedaba sin ligar para siempre al
// facturar. `remisionTipoAntesCancelar` cubre el caso en que esa Remisión ya
// se canceló (p. ej. se está facturando en el mismo lote que otra orden):
// sigue contando como "sobre una remisión a crédito".
const esAbonoSobreRemisionCredito = (p, pagosOrden) =>
  p.comprobante === "RECIBO_PROVISIONAL" &&
  p.tipoPago === "ABONO" &&
  (pagosOrden || []).some(
    (r) =>
      r.comprobante === "REMISION" &&
      (r.remision?.tipo === "Credito" || r.remisionTipoAntesCancelar === "Credito")
  );

// Un anticipo, remisión, o abono-sobre-remisión-a-crédito "pasa a esta
// factura": la parte de INCLUIR de la pantalla de Nueva Factura (ver
// comprobantesCajas). 'OTRA_FACTURA' ya se canceló aparte y 'VIGENTE' se deja
// tal cual. `orden` (opcional) es el Vehiculo completo — sin él (p. ej. un
// filtro que no lo necesita) el abono-sobre-remisión-crédito simplemente no
// se detecta.
const esAnticipoORemisionVigente = (p, orden) =>
  !p.cancelado &&
  (p.tipoPago === "ANTICIPO" || p.comprobante === "REMISION" || esAbonoSobreRemisionCredito(p, orden?.pagos));

// Factura Global: la orden llega con una Nota de Venta (el saldo) pero su
// anticipo con Recibo Provisional puede seguir vigente. Ese anticipo es parte
// de la misma venta, así que pasa a la Global igual que pasaría a una factura
// normal — pero SOLO el que quedó explícitamente ligado a una de las notas
// que esta Global agrupa (pago.notaVentaLigadaId, ver POST /api/cajas/:id/pagos):
// no "cualquier anticipo vigente de la orden", que podría barrer uno que en
// realidad es de otra venta futura de la misma orden. Un anticipo viejo, de
// antes de que existiera este link, no se recoge solo: hay que ligarlo a mano
// (ver [[project_anticipo_en_factura_global]] en la memoria del proyecto).
function filtroAnticipoFacturaGlobal(notaPagoIds) {
  const ids = new Set((Array.isArray(notaPagoIds) ? notaPagoIds : []).map(String).filter(Boolean));
  return (p) =>
    !p.cancelado &&
    p.tipoPago === "ANTICIPO" &&
    p.comprobante === "RECIBO_PROVISIONAL" &&
    !!p.notaVentaLigadaId &&
    ids.has(String(p.notaVentaLigadaId));
}

// Órdenes (solo su _id) a las que pertenecen las notas de venta de una Global.
const ordenesDeNotasVenta = (notasVenta) => [
  ...new Set(
    (Array.isArray(notasVenta) ? notasVenta : []).map((n) => String(n?.vehiculoId || "")).filter(Boolean)
  ),
].map((_id) => ({ _id }));

// Pre-check ANTES de timbrar: un anticipo se guarda como saldo a favor del
// cliente (aSaldoAFavor / saldoAFavorMovimientoId). Si el cliente ya usó ese
// saldo en otra orden, el depósito no se puede revertir y cancelar el anticipo
// al facturar dejaría el saldo descuadrado. Como el CFDI ya estaría timbrado
// cuando corre la cancelación, esto se valida antes: devuelve la lista de
// conflictos (vacía = se puede timbrar). El chequeo es acumulativo por cliente
// (si dos anticipos van a esta factura, el saldo debe alcanzar para ambos).
async function conflictosAnticiposAntesDeTimbrar(ordenes, decisiones = {}, esVigente = esAnticipoORemisionVigente) {
  const decision = (pagoId) => decisiones[String(pagoId)] || "INCLUIR";
  const centavos = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const conflictos = [];
  const saldoLibrePorCliente = new Map(); // clienteId -> saldo a favor aún no reservado

  for (const o of ordenes) {
    if (!o?._id) continue;
    const vehiculo = await Vehiculo.findById(o._id).select("ordenServicio pagos").lean();
    if (!vehiculo) continue;
    for (const p of vehiculo.pagos || []) {
      if (!esVigente(p, vehiculo) || decision(p._id) !== "INCLUIR") continue;
      if (!p.aSaldoAFavor || !p.saldoAFavorMovimientoId) continue;

      const mov = await AnticipoCliente.findById(p.saldoAFavorMovimientoId)
        .select("tipo monto cliente cancelado")
        .lean();
      if (!mov || mov.tipo !== "DEPOSITO" || mov.cancelado) continue;

      const clienteKey = String(mov.cliente);
      if (!saldoLibrePorCliente.has(clienteKey)) {
        const c = await Cliente.findById(mov.cliente).select("saldoAFavor").lean();
        saldoLibrePorCliente.set(clienteKey, centavos(c?.saldoAFavor));
      }
      const libre = saldoLibrePorCliente.get(clienteKey);
      const requerido = centavos(mov.monto);
      if (libre + 1e-6 < requerido) {
        conflictos.push({
          ordenServicio: vehiculo.ordenServicio || o.ordenServicio || "",
          recibo: p.reciboProvisional?.numero ?? p.notaVenta?.numero ?? null,
          requerido,
          disponible: libre,
        });
      } else {
        saldoLibrePorCliente.set(clienteKey, centavos(libre - requerido));
      }
    }
  }
  return conflictos;
}

// Al generar una factura de ingreso, cualquier anticipo o remisión vigente de
// las órdenes facturadas deja de tener sentido como comprobante de cobro
// aparte: se cancela automáticamente y se enlaza a la factura recién creada
// (pago.facturaId), en vez de dejar que un admin lo cancele a mano sin dejar
// registrado a qué factura pasó (eso queda solo para corregir errores de
// captura, ver POST /api/cajas/:id/pagos/:pagoId/cancelar).
// La reversa económica (saldo a favor + terminal del Cierre de Caja) usa los
// mismos helpers que esa ruta de Cajas. Devuelve los avisos (best-effort) de
// pagos que no se pudieron revertir del todo.
//
// `filtro` decide qué pagos de cada orden pasan a la factura (por defecto, todo
// anticipo o remisión vigente). La Factura Global lo restringe a los anticipos
// con Recibo Provisional (ver esAnticipoParaFacturaGlobal) y, como agrupa notas
// de venta y no órdenes completas, no limpia la marca "pendiente de factura"
// (`limpiarPendiente: false`).
async function cancelarAnticiposYRemisionesPorFactura(
  ordenes,
  facturaDoc,
  decisiones = {},
  user = null,
  { filtro = esAnticipoORemisionVigente, limpiarPendiente = true } = {}
) {
  const folioFactura = `${facturaDoc.serie || ""}${facturaDoc.folio || ""}`;
  const etiquetaFactura = facturaDoc.tipoFactura === "facturaGlobal" ? "factura global" : "factura";
  // Sin decisión para un pago = 'INCLUIR' (comportamiento histórico).
  const decision = (pagoId) => decisiones[String(pagoId)] || "INCLUIR";
  const avisos = [];

  for (const o of ordenes) {
    if (!o?._id) continue;
    const vehiculo = await Vehiculo.findById(o._id);
    if (!vehiculo) continue;

    // Vigentes que el usuario dejó (o dejó por defecto) para ESTA factura.
    // 'OTRA_FACTURA' (ya se canceló aparte, hacia otra factura) y 'VIGENTE' se saltan.
    const candidatos = (vehiculo.pagos || []).filter(
      (p) => filtro(p, vehiculo) && decision(p._id) === "INCLUIR"
    );

    // Al facturar de verdad la orden deja de estar "pendiente de facturar".
    const debeLimpiarPendiente = limpiarPendiente && !!vehiculo.pendienteFactura;
    if (!candidatos.length && !debeLimpiarPendiente) continue;

    if (debeLimpiarPendiente) {
      vehiculo.pendienteFactura = false;
      vehiculo.pendienteFacturaEn = null;
      vehiculo.pendienteFacturaPor = "";
    }

    // Datos para revertir la terminal, leídos ANTES de tocar el pago.
    const cancelados = [];
    for (const pago of candidatos) {
      const datosTerm = datosMovimientosTerminal(pago);

      // Anticipo guardado como saldo a favor: revertir el depósito ANTES de
      // marcar el pago (guarda atómica). Si el cliente ya gastó ese saldo, se
      // deja el anticipo vigente y se avisa (el pre-check debió evitarlo).
      if (pago.aSaldoAFavor && pago.saldoAFavorMovimientoId) {
        try {
          await cancelarDeposito(
            pago.saldoAFavorMovimientoId,
            `Se cancela anticipo y pasa a ${etiquetaFactura} ${folioFactura}`,
            user
          );
        } catch (errDep) {
          if (errDep instanceof SaldoInsuficienteError) {
            avisos.push(
              `El anticipo de la orden ${vehiculo.ordenServicio || o.ordenServicio || ""} no se pudo cancelar automáticamente: el cliente ya usó ese saldo a favor. Cancélalo a mano en Cajas.`
            );
            continue;
          }
          throw errDep;
        }
      }

      const esRemision = pago.comprobante === "REMISION";
      const etiquetaPago = esRemision
        ? "remisión"
        : pago.tipoPago === "ABONO"
        ? "abono (se trata como anticipo)"
        : "anticipo";
      pago.cancelado = true;
      pago.canceladoEn = new Date();
      pago.canceladoPor = "Sistema (factura)";
      pago.motivoCancelacion = `Se cancela ${etiquetaPago} y pasa a ${etiquetaFactura} ${folioFactura}`;
      pago.motivoCancelacionTipo = "PASA_A_FACTURA";
      if (!pago.notasAntesCancelar) pago.notasAntesCancelar = pago.notas || "";
      // NO se pisa pago.notas: conserva la referencia original del cobro, que el
      // Reporte de Facturas muestra junto a "SE CANCELÓ ... Y PASA A FACTURA".
      pago.facturaId = facturaDoc._id;
      if (esRemision) {
        if (!pago.remisionTipoAntesCancelar) pago.remisionTipoAntesCancelar = pago.remision?.tipo || "Contado";
        pago.remision.tipo = "Cancelada";
      }
      cancelados.push({ pago, datosTerm });
    }

    if (!cancelados.length && !debeLimpiarPendiente) continue;

    await vehiculo.save();
    // Al dejar de contar como abonado puede reaparecer saldo: las remisiones
    // vigentes de la orden vuelven a quedar sin Fecha de Pagada.
    await sincronizarFechaPagadaRemisiones(vehiculo);

    for (const { pago, datosTerm } of cancelados) {
      // Saldo a favor que este anticipo ya tenía aplicado a la orden
      // (sincronizarAnticiposAplicados): se le regresa al cliente.
      if (datosTerm.saldoAplicado > 0) {
        try {
          await revertirUso(vehiculo.cliente, datosTerm.saldoAplicado, {
            ordenAplicada: vehiculo._id,
            pagoId: pago._id,
            registradoPor: user?.name || user?.username || "Sistema (factura)",
            registradoPorId: user?._id || null,
          });
        } catch (errRev) {
          console.error("Error revirtiendo saldo aplicado al facturar:", errRev);
        }
      }
      await moverTerminalesDePago(datosTerm, -1);
    }
  }

  return avisos;
}

module.exports = {
  esAnticipoORemisionVigente,
  esAbonoSobreRemisionCredito,
  filtroAnticipoFacturaGlobal,
  ordenesDeNotasVenta,
  conflictosAnticiposAntesDeTimbrar,
  cancelarAnticiposYRemisionesPorFactura,
};
