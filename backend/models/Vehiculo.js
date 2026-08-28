// backend/models/Vehiculo.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// al inicio, antes del schema:
const ESTADOS_ORDEN = [
  'INGRESO',
  'PENDIENTE_REFACCIONARIA',
  'PENDIENTE_AUTORIZACION_CLIENTE',
  'PENDIENTE_SURTIR',
  'PENDIENTE_CIERRE',
  'REPARACION_EN_CURSO',
  'CALIDAD',
  'PENDIENTE_CERRAR',
  'CERRADA',
  'CANCELADA',
];

// ===== Cajas: catálogos =====
const BANCOS_CAJA = ['BANREGIO', 'AMERICAN EXPRESS', 'BANAMEX', 'BANORTE', 'BBVA BANCOMER', 'DOLARES', 'EFECTIVOS', 'CHEQUE', 'TRANSFERENCIA'];
const TIPO_NOTA = ['Contado', 'Credito', 'Cancelada'];
// Terminales físicas para cobros con tarjeta en Cajas (mismo catálogo que
// TERMINALES_TARJETA en routes/cajas.js). El '' es el valor por defecto:
// "sin terminal" (pago que no se cobró con tarjeta) y debe ser válido para el
// enum, o un vehiculo.save() posterior sobre ese pago falla la validación.
const TERMINALES_TARJETA_CAJA = ['', 'BANREGIO', 'AMERICAN EXPRESS', 'BANAMEX', 'BANORTE', 'BBVA BANCOMER'];

// ===== Solicitud de Garantía =====
// Sub-documento embebido en la orden NUEVA que se abre por garantía.
// default: null → las órdenes normales no llevan garantía.
const garantiaSchema = new Schema(
  {
    estado: {
      type: String,
      enum: ['PENDIENTE', 'APROBADA', 'NEGADA', 'NO_APLICA'],
      default: 'PENDIENTE',
    },
    motivo: { type: String, default: '' },
    ordenAnterior: { type: Schema.Types.ObjectId, ref: 'Vehiculo', default: null },
    ordenAnteriorFolio: { type: String, default: '' },
    fechaSolicitud: { type: Date, default: null },
    // "fecha devolución solicitud": se captura al aprobar o negar
    fechaResolucion: { type: Date, default: null },
    // Ajuste al total de la orden (SIN IVA); negativo = descuento
    costoDiferencia: { type: Number, default: 0 },
    autorizaCarreon: { type: Boolean, default: false },
    resueltoPor: { type: String, default: '' },
    // Ticket GARANTIA_NO_APLICA abierto por el asesor al intentar cancelar
    // esta orden (ver ModalCancelarOrden / POST /api/tickets). Mientras esté
    // seteado, la orden queda de solo lectura (ver soloLectura en
    // VehiculoOrdenDetalle.jsx) hasta que un admin resuelva el ticket
    // (PUT /api/tickets/:id/resolver-garantia).
    ticketPendiente: { type: Schema.Types.ObjectId, ref: 'Ticket', default: null },
  },
  { _id: false }
);

const vehiculoSchema = new Schema(
  {

    // Referencia al cliente dueño del vehículo
    cliente: {
      type: Schema.Types.ObjectId,
      ref: 'Cliente',
      required: true,
    },

    // Orden "Sin Vehículo": cliente walk-in que compra refacciones sueltas o
    // recibe un servicio sin registrar vehículo. Se decide en la creación;
    // no se incluye en el whitelist de PUT /:id/datos, por lo que es
    // inmutable después de creada la orden.
    sinVehiculo: { type: Boolean, default: false },

    // Firma capturada del cliente (data URL PNG) para el Formato Operativo —
    // se muestra en la sección "AUTORIZACIÓN Y FIRMA DEL CLIENTE...". null
    // hasta que alguien la capture desde el visor de PDF.
    firmaAutorizacionCliente: { type: String, default: null },

    // NUEVO: estado de la orden
    estadoOrden: {
      type: String,
      enum: ESTADOS_ORDEN,
      default: 'INGRESO',
      index: true,
    },

    // Estado en el que se encontraba la orden justo antes de cerrarse o
    // cancelarse. Permite a un admin "restablecerla" a ese estado.
    estadoAnterior: {
      type: String,
      enum: ESTADOS_ORDEN,
      default: null,
    },

    // Solicitud de garantía (null = orden normal)
    garantia: { type: garantiaSchema, default: null },

    // Motivo capturado al cancelar la orden desde Presupuesto y Venta al
    // Cliente (ver PUT /:id/presupuesto-venta con estadoOrden: CANCELADA).
    motivoCancelacion: { type: String, default: '' },
    canceladoPor: { type: String, default: '' },
    fechaCancelacion: { type: Date, default: null },

    fechaSolicitudRefacciones: { type: Date, default: null },
    fechaRespuestaRefaccionaria: { type: Date, default: null },
    // El asesor decidió continuar sin solicitar refacciones a refaccionaria
    refaccionesOmitidas: { type: Boolean, default: false },
    fechaEnvioSurtir: { type: Date, default: null },
    creadoPor: { type: String, default: "" },
    // Referencia estable al usuario que creó la orden. `creadoPor` (nombre)
    // se conserva como snapshot histórico y NO se reescribe si el usuario
    // cambia de nombre después; los filtros/joins deben usar creadoPorId,
    // cayendo a creadoPor solo para órdenes viejas sin este campo.
    creadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    devueltoPor: { type: String, default: "" },
    // Grupo de trabajo (si existía uno activo) del usuario que creó la orden.
    // Se conserva aunque el grupo luego se desactive o cambie de miembros.
    grupoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grupo', default: null },

    //---- FECHA DE CIERRE -----
    fechaCierre:{ type: Date, default: null},


    // Versión del contrato (ContratoOrdenServicio) vigente al crear esta
    // orden. Se fija una sola vez, al crearla (ver POST /api/vehiculos y
    // resolverGarantiaTicket.js), y ya no cambia: así, si el contrato se
    // edita después desde Configuración, esta orden sigue imprimiendo el
    // texto con el que se abrió y solo las órdenes nuevas usan el nuevo.
    // null en órdenes creadas antes de este campo (caen al contrato vigente
    // actual al imprimir, ver VehiculoOperativoPdf.js).
    contratoOrdenServicio: { type: Schema.Types.ObjectId, ref: 'ContratoOrdenServicio', default: null },

    // ----- Datos de Orden / cabecera -----
    ordenServicio: String,
    // true en la orden de reemplazo auto-creada al resolver un ticket
    // GARANTIA_NO_APLICA como "No aplica" (ver resolverGarantiaTicket.js):
    // esa orden nace con ordenServicio en blanco hasta que el asesor
    // capture el folio real desde la pestaña Datos (PUT /:id/datos, que
    // limpia esta bandera en cuanto llega un folio no vacío).
    ordenServicioPendiente: { type: Boolean, default: false },
    fechaRecepcion: Date,
    horaRecepcion: String,


    // Presupuesto
    dirigidoA: { type: String, default: "" },
    departamento: { type: String, default: "" },
    observCotizacion: { type: String, default: "" },
    requiereFactura: { type: Boolean, default: false },

    // Pendiente de Factura (Cajas): la orden se cerró/cobró pero al cliente
    // le faltan datos fiscales para generar la factura real; queda visible
    // en el apartado "Pendientes de Factura" de Cajas hasta que se genere la
    // factura (se limpia sola, ver generar_xml.js) o un cajero la desmarque.
    pendienteFactura: { type: Boolean, default: false },
    pendienteFacturaEn: { type: Date, default: null },
    pendienteFacturaPor: { type: String, default: '' },

    // ----- Datos de vehículo -----
    nombreUsuarioDejaVehiculo: String,
    marca: String,
    modelo: String,
    anio: String,
    color: String,
    serie: String,
    placas: String,
    kmsMillas: String,
    nacionalidad: String,
    motor: String,
    numeroEconomico: String,
    traccion: String,

    // ----- Inspección física al recibir el vehículo -----
    inspeccionFisica: {
      // Accesorios / checkboxes
      grua: { type: String, default: "" },
      precioGrua: { type: Number, default: 0 },
      espejoLateralIzq: { type: Boolean, default: false },
      espejoLateralDer: { type: Boolean, default: false },
      copasDelanterasIzq: { type: Boolean, default: false },
      copasDelanterasDer: { type: Boolean, default: false },
      parabrisas: { type: String, default: "" },
      focosDel: { type: Boolean, default: false },
      focosTras: { type: Boolean, default: false },
      espejoInt: { type: Boolean, default: false },
      tapetesDelanterosIzq: { type: Boolean, default: false },
      tapetesDelanterosDer: { type: Boolean, default: false },
      estereo: { type: Boolean, default: false },
      extra: { type: Boolean, default: false },
      copasTraserasIzq: { type: Boolean, default: false },
      copasTraserasDer: { type: Boolean, default: false },
      micas: { type: Boolean, default: false },
      antena: { type: Boolean, default: false },
      encendedor: { type: Boolean, default: false },
      tapetesTraserosIzq: { type: Boolean, default: false },
      tapetesTraserosDer: { type: Boolean, default: false },
      gato: { type: Boolean, default: false },
      bateria: { type: Boolean, default: false },
      nivelGasolina: { type: String, default: null },
      danoVehiculo: { type: String, default: null },
      // Indicadores tablero / mecánicos
      checkEngine: { type: String, default: "" },
      abs: { type: String, default: "" },
      airBag: { type: String, default: "" },
      frenos: { type: String, default: "" },
      aceite: { type: String, default: "" },
      alternador: { type: String, default: "" },
      indicadoresTablero: { type: String, default: "" },
      otros: { type: String, default: "" },
      observaciones: { type: String, default: "" },
    },

   // ===== Servicio o Reparación =====
  servicioReparacion: {
    serviciosSeleccionados: [{ type: String }],

    mantenimientoMotor: {
      afinacion: { type: Boolean, default: false },
      limpiezaInyectores: { type: Boolean, default: false },
      limpiezaCuerpoAceleracion: { type: Boolean, default: false },
      lubricacion: { type: Boolean, default: false },
      cambioAceite: { type: Boolean, default: false },
      engrase: { type: Boolean, default: false },
      revisionNivelesFluidos: { type: Boolean, default: false },
      lubricacionBisagras: { type: Boolean, default: false },
      lubricarSuspensionDireccion: { type: Boolean, default: false },
      revisionCarretera: { type: Boolean, default: false },
      diagnosticoCompra: { type: Boolean, default: false },
      otrosServicios: { type: Boolean, default: false },
      alineacionComputadora: { type: Boolean, default: false },
      balanceo4Ruedas: { type: Boolean, default: false },
      reemplazoBalatas4Ruedas: { type: Boolean, default: false },
      recargaGasAC: { type: Boolean, default: false },
      servicioCoolingTermostato: { type: Boolean, default: false },
    },

    fallasReportadasCliente: { type: String, default: "" },

    sintomas: {
      noEnciende: { type: Boolean, default: false },
      tardaEncenderFrio: { type: Boolean, default: false },
      tardaEncenderCaliente: { type: Boolean, default: false },
      cascabelea: { type: Boolean, default: false },
      motorTembloroso: { type: Boolean, default: false },
      faltaPotencia: { type: Boolean, default: false },
      hechaHumo: { type: Boolean, default: false },
      humoColor: { type: String, default: "" },
    },

    indicadoresTableroServicio: {
      checkEngine: { type: Boolean, default: false },
      abs: { type: Boolean, default: false },
      airBag: { type: Boolean, default: false },
      frenos: { type: Boolean, default: false },
      aceite: { type: Boolean, default: false },
      alternador: { type: Boolean, default: false },
      otros: { type: String, default: "" },
    },

    fallasMotorOtros: { type: String, default: "" },
    precioFallasMotorOtros: { type: Number, default: 0 },

    sistemaElectricoAire: { type: String, default: "" },
    precioSistemaElectricoAire: { type: Number, default: 0 },

    suspensionDireccionFrenos: { type: String, default: "" },
    precioSuspensionDireccionFrenos: { type: Number, default: 0 },

    sistemaEnfriamiento: { type: String, default: "" },
    precioSistemaEnfriamiento: { type: Number, default: 0 },

    infoLlantas: { type: String, default: "" },
    revisionFallas: { type: String, default: "" },
  },

    // ===== Servicios de catálogo seleccionados (snapshot, no referencia viva) =====
    // Cada entrada es una copia congelada de un ServicioCatalogo al momento en que
    // el asesor lo seleccionó y envió; cambios posteriores al catálogo no afectan
    // órdenes ya emitidas. Se llena únicamente desde PUT /:id/omitir-refacciones,
    // nunca desde PUT /:id/servicio (que reemplaza servicioReparacion completo).
    serviciosCatalogoSeleccionados: [
      {
        servicioId: { type: Schema.Types.ObjectId, ref: 'ServicioCatalogo', default: null },
        nombre: { type: String, default: "" },
        refacciones: [
          {
            nombre: { type: String, default: "" },
            obligatoria: { type: Boolean, default: false },
            incluida: { type: Boolean, default: true },
            observacion: { type: String, default: "" },
          },
        ],
        fechaSeleccion: { type: Date, default: Date.now },
      },
    ],

    // indica si la orden ya fue “iniciada” desde Servicio/Reparación
    ordenIniciada: {
      type: Boolean,
      default: false,
    },

    // ===== Requisición y diagnóstico =====
    diagnosticoTecnico: { type: String, default: "" },

    refaccionesSolicitadas: [
      {
        // Campos propios de la solicitud (no se duplican en opciones)
        cant: { type: Number, default: 0 },
        refaccion: { type: String, default: "" },

        // Índice de la opción elegida por el asesor (null = sin selección)
        opcionSeleccionada: { type: Number, default: null },

        // Cotizaciones de refaccionaria para esta refacción
        opciones: [
          {
            unidad: { type: String, default: "" },
            tipo: { type: String, default: "" },
            marca: { type: String, default: "" },
            proveedor: { type: String, default: "" },
            codigo: { type: String, default: "" },
            precioUnitario: { type: Number, default: 0 },
            importeTotal: { type: Number, default: 0 },
            moneda: { type: String, default: "MN" },
            tipoCambio: { type: Number, default: 0 },
            tiempoEntrega: { type: String, default: "" },
            core: { type: String, default: "" },
            precioCore: { type: Number, default: 0 },
            observaciones: { type: String, default: "" },
          },
        ],

        estatus: {
          type: String,
          enum: ['PENDIENTE', 'APROBADA', 'RECHAZADA'],
          default: 'PENDIENTE',
        },


// 👇👇 NUEVOS CAMPOS PARA ORDEN DE COMPRA
        requiereOC: { type: Boolean, default: false },   // el checkbox del mecánico
        ocGenerada: { type: Boolean, default: false },   // ya se generó al menos una OC
        numeroOC:   { type: String,  default: null },    // folio de la OC principal
        ordenCompra: {
          type: Schema.Types.ObjectId,
          ref: 'OrdenCompra',
          default: null,
        },
      },
    ],

    // ===== Cargos en orden =====
    cargosEnOrden: [
      {
        cant: { type: Number, default: 0 },
        unidad: { type: String, default: "" },
        concepto: { type: String, default: "" }, // “Refacción y/o Servicio”
        marca: { type: String, default: "" },
        proveedor: { type: String, default: "" },
        codigo: { type: String, default: "" },
        precioUnitario: { type: Number, default: 0 },
        importeTotal: { type: Number, default: 0 },
        moneda: { type: String, default: "MN" },
        observaciones: { type: String, default: "" },
        documento: { type: String, default: "" }, // p.ej. factura ligada
      },
    ],

    // ===== Historial de cotizaciones =====
    historialCotizaciones: [
      {
        folio: String,
        fecha: Date,
        estado: String,
        dirigidoA: String,
        departamento: String,
        observCotizacion: String,
        partidas: []
      }
    ],

    // ===== Historial de venta al cliente =====
    historialVentaCliente: [
      {
        folio: { type: String, default: "" },
        fecha: { type: Date, default: Date.now },

        estado: {
          type: String,
          enum: [
            "BORRADOR",
            "ENVIADA",
            "PARCIALMENTE_AUTORIZADA",
            "AUTORIZADA",
            "NO_AUTORIZADA",
            "PENDIENTE",
            "REACTIVADA",
            "VENDIDA",
          ],
          default: "BORRADOR",
        },

        dirigidoA: { type: String, default: "" },
        departamento: { type: String, default: "" },
        observCotizacion: { type: String, default: "" },

        partidas: [
          {
            cant: { type: Number, default: 0 },
            concepto: { type: String, default: "" },
            refaccion: { type: String, default: "" },
            tipo: { type: String, default: "" },
            marca: { type: String, default: "" },
            proveedor: { type: String, default: "" },
            codigo: { type: String, default: "" },

            precioCompra: { type: Number, default: 0 },
            precioOriginal: { type: Number, default: 0 },
            moneda: { type: String, default: "MN" },
            tipoCambio: { type: Number, default: 0 },

            tiempoEntrega: { type: String, default: "" },
            horasMO: { type: Number, default: 0 },
            precioVenta: { type: Number, default: 0 },
            observInt: { type: String, default: "" },

            estatusCliente: {
              type: String,
              enum: [
                "COTIZADA",
                "AUTORIZADA",
                "NO_AUTORIZADA",
                "PENDIENTE",
                "REACTIVADA",
                "VENDIDA",
              ],
              default: "COTIZADA",
            },

            origenPresupuestoIndex: { type: Number, default: null },
          },
        ],
      },
    ],


    // ===== Presupuesto (refacciones autorizadas) =====
    presupuesto: [
      {
        origenRefId: { type: String, default: null },
        cant: { type: Number, default: 0 },
        concepto: { type: String, default: "" },
        refaccion: { type: String, default: "" },
        tipo: { type: String, default: "" },
        marca: { type: String, default: "" },
        proveedor: { type: String, default: "" },
        codigo: { type: String, default: "" },
        precioCompra: { type: Number, default: 0 },
        tiempoEntrega: { type: String, default: "" },
        horasMO: { type: Number, default: 0 },
        precioVenta: { type: Number, default: 0 },
        observInt: { type: String, default: "" },
        // Campos de cotización (mismo detalle que refaccionesSolicitadas.opciones),
        // capturados al completar el detalle de una refacción de Servicio de
        // catálogo antes de poder surtirla (ver PorSurtir.jsx "Completar").
        unidad: { type: String, default: "" },
        moneda: { type: String, default: "MN" },
        tipoCambio: { type: Number, default: 0 },
        core: { type: String, default: "" },
        precioCore: { type: Number, default: 0 },
        estatusCotizacion: {
          type: String,
          enum: [
            "COTIZADA",
            "PENDIENTE_CLIENTE",
            "AUTORIZADA",
            "RECHAZADA",
            "EJECUTADA",
            "REACTIVADA",
          ],
          default: "COTIZADA",
        },
        estatusCliente: {
          type: String,
          enum: [
            "COTIZADA",
            "AUTORIZADA",
            "NO_AUTORIZADA",
            "PENDIENTE",
            "REACTIVADA",
            "VENDIDA",
          ],
          default: "COTIZADA",
        },
        autorizado: { type: Boolean, default: false }, // ← asesor marcó ✓
        surtida: { type: Boolean, default: false },     // ← refaccionaria surtió
        // Partida de servicio/mano de obra: no pasa por refaccionaria ni surtido
        esServicio: { type: Boolean, default: false },
        // Línea auto-generada a partir del precio de grúa capturado en la
        // inspección física: no pasa por refaccionaria y solo un admin puede
        // eliminarla o desautorizarla desde Presupuesto (ver VehiculoPresupuestoVenta.jsx).
        esGrua: { type: Boolean, default: false },
        // Refacción que vino de un Servicio de catálogo (brincó refaccionaria):
        // Por Surtir exige capturar marca/proveedor/código antes de poder surtirla.
        origenServicioCatalogo: { type: Boolean, default: false },
        // Agrupa la fila esServicio de un Servicio de catálogo con las
        // refacciones que trae incluidas (mismo id = mismo paquete). En la
        // fila esServicio vale su propio _id; en las refacciones hijas vale
        // el _id de esa fila padre. Permite mostrarlas colapsadas en
        // Presupuesto y excluirlas del PDF/Venta al Cliente (solo se ve/factura
        // el servicio que las agrupa).
        servicioGrupoId: { type: Schema.Types.ObjectId, default: null },
      },
    ],

    // ===== Venta al Cliente (cierre) =====
    ventaCliente: [
      {
        cant: { type: Number, default: 0 },
        concepto: { type: String, default: "" },
        precioVenta: { type: Number, default: 0 },
        observaciones: { type: String, default: "" },
        autorizacionCliente: {
          type: String,
          enum: ["SI", "NO", "PENDIENTE"],
          default: "SI",
        },
        codigoServicio: { type: String, default: "" },
        descripcionServicio: { type: String, default: "" },
        codigoSat: { type: String, default: "" },
        descripcionSat: { type: String, default: "" },
        motivoPrecioCero: { type: String, default: "" }, // justificación cuando precioVenta <= 0
        esGarantia: { type: Boolean, default: false }, // legado: ya no se inyectan filas de garantía; solo para limpiar datos viejos
        esGrua: { type: Boolean, default: false }, // marca la línea auto-generada a partir del precio de grúa
      },
    ],

    // ===== Mano de Obra =====
    manoObra: [
      {
        concepto: { type: String, default: "" },
        // Liga con la partida de presupuesto[] (esServicio: true) que el
        // asesor seleccionó al asignar esta mano de obra. Null en filas
        // legado capturadas antes de este cambio (concepto de texto libre).
        presupuestoId: { type: Schema.Types.ObjectId, default: null },
        // Precio de venta (sin IVA) de la partida de Venta al Cliente al
        // momento de asignar la mano de obra. Se usa en reportes de RH en
        // lugar de volver a buscar en presupuesto[], porque el asesor puede
        // editar/agregar/quitar partidas en Venta al Cliente sin que eso
        // se refleje en presupuesto[].
        precioServicio: { type: Number, default: 0 },
        mecanico: { type: String, default: "" },
        horas: { type: Number, default: 0 },
        // Horas de esta asignación ya anticipadas (pagadas por adelantado) al
        // mecánico; nunca mayor a `horas`. El monto correspondiente se
        // recalcula con TARIFA_HORA, no se guarda.
        horasAnticipadas: { type: Number, default: 0 },
        fechaPago: { type: String, default: "" },
        observaciones: { type: String, default: "" },

        // ← nuevos
        esCarroceria:     { type: Boolean, default: false },
        carrocero:        { type: String, default: "" },
        precioCarroceria: { type: Number, default: 0 },
      },
    ],

// ===== IVA (porcentaje editable, normalmente 8%) =====
ivaPresupuesto: { type: Number, default: 8 },
ivaVenta: { type: Number, default: 8 },

// ===== Observaciones finales =====
observacionesExternas: { type: String, default: "" },
observacionesInternas: { type: String, default: "" },
// ===== Control de cierre =====
pendienteCierre: { type: Boolean, default: false },

    // ===== Último Vale de Salida emitido para esta orden =====
    ultimoVale: {
      id: { type: Schema.Types.ObjectId, ref: 'ValeSalida', default: null },
      noVale: { type: Number, default: null },
      dig: { type: Number, default: 0 },
      fecha: { type: Date, default: null },
    },

    // ===== Cajas: pagos / abonos =====
    // Cada pago lleva su propio comprobante (Nota de Venta o Remisión), con
    // folio propio asignado al momento de registrarlo — un mismo pago no
    // puede tener ambos comprobantes.
    pagos: [
      {
        fecha: { type: Date, default: Date.now },
        tipoPago: { type: String, enum: ['COMPLETO', 'ABONO', 'ANTICIPO'], default: 'ABONO' },
        comprobante: { type: String, enum: ['NOTA_VENTA', 'REMISION', 'RECIBO_PROVISIONAL'], required: true },
        // Solo cuando tipoPago === 'ANTICIPO': a qué reporte diario de Cajas
        // se suma este anticipo (ver buildReporteFacturasDiario /
        // buildReporteRemisionesDiario en routes/reportes.js). Reusa el mismo
        // vocabulario que `comprobante` aunque el anticipo se documente con
        // Recibo Provisional, no con Nota de Venta/Remisión real.
        anticipoDestino: { type: String, enum: ['NOTA_VENTA', 'REMISION'], default: null },
        // Solo cuando tipoPago === 'ANTICIPO': el dinero se guardó como saldo a
        // favor del cliente (Cliente.saldoAFavor, vía un movimiento
        // AnticipoCliente tipo DEPOSITO) en vez de abonarse a la orden — no
        // tiene sentido "dar cambio" de un anticipo cuando la orden aún no
        // tiene precio. El pago conserva monto/forma de pago para el Recibo
        // Provisional y para la sección "Anticipos" del Reporte diario de
        // Cajas, pero NO cuenta como abonado en calcularTotalesOrden.
        // saldoAFavorMovimientoId liga al DEPOSITO para poder revertirlo si el
        // pago se cancela (ver POST /:id/pagos/:pagoId/cancelar).
        aSaldoAFavor: { type: Boolean, default: false },
        saldoAFavorMovimientoId: { type: Schema.Types.ObjectId, ref: 'AnticipoCliente', default: null },
        montoPesos: { type: Number, default: 0 },
        montoDolares: { type: Number, default: 0 },
        tipoCambio: { type: Number, default: 0 },
        // monto total ya convertido a MN = montoPesos + montoDolares*tipoCambio
        monto: { type: Number, default: 0 },
        referencia: { type: String, default: '' },
        observaciones: { type: String, default: '' },
        // Descriptor corto de cómo fue el movimiento (Abono, Liquida, Anticipo,
        // "Se cancela remisión y pasa a factura"...). Se sugiere solo desde
        // CajaModalPago según tipoPago/tipoRemision, pero es editable.
        notas: { type: String, default: '' },
        registradoPor: { type: String, default: '' },

        // Cancelación del pago (p. ej. se cancela el anticipo o la remisión de
        // la orden para poder facturarla). Un pago cancelado deja de contar
        // como abonado en calcularTotalesOrden y libera a la orden de la
        // restricción de "ya tiene remisión". El folio del comprobante se
        // conserva: no se reutiliza ni se borra, solo queda marcado.
        cancelado: { type: Boolean, default: false },
        canceladoEn: { type: Date, default: null },
        canceladoPor: { type: String, default: '' },
        motivoCancelacion: { type: String, default: '' },
        // Factura a la que pasó este pago cuando se cancela porque se
        // facturó la orden (ver generar_xml.js). Null cuando la cancelación
        // fue una corrección manual por error de captura (ver cajas.js).
        facturaId: { type: Schema.Types.ObjectId, ref: 'FacturaCfdi', default: null },
        // Factura Global (CFDI al público en general) que agrupó esta Nota de
        // Venta. Se marca al generar el CFDI global (ver generar_xml.js) para
        // que la misma nota no entre en dos facturas globales; se limpiaría al
        // cancelar ese CFDI. El pago NO se cancela: sigue contando como cobro.
        facturaGlobalId: { type: Schema.Types.ObjectId, ref: 'FacturaCfdi', default: null },

        // Presente solo si comprobante === 'NOTA_VENTA'
        // numero sin default: si se le pone `default: null`, Mongoose lo agrega
        // también a los pagos por REMISION (aplica defaults del subdocumento
        // completo en $push), y ese `null` explícito rompe el índice unique+sparse
        // de abajo porque sparse solo excluye campos ausentes, no en null.
        notaVenta: {
          numero: { type: Number },
          banco: { type: String, enum: BANCOS_CAJA },
          tipo: { type: String, enum: TIPO_NOTA, default: 'Contado' },
        },

        // Presente solo si comprobante === 'REMISION' (ver nota arriba)
        remision: {
          numero: { type: Number },
          tipo: { type: String, enum: TIPO_NOTA, default: 'Contado' },
          fechaPagada: { type: Date, default: null },
        },

        // Recibo Provisional: se genera automáticamente cuando tipoPago es
        // ABONO o ANTICIPO, y es el único comprobante permitido en ese caso
        // (ver nota arriba sobre no ponerle default a `numero`).
        reciboProvisional: {
          numero: { type: Number },
          formaPago: { type: String, enum: ['EFECTIVO', 'CREDITO', 'DEBITO', 'CHEQUE', 'TRANSFERENCIA', 'COMBINADO'], default: 'EFECTIVO' },
          chequeNumero: { type: String, default: '' },
          concepto: { type: String, default: '' },
          recibio: { type: String, default: '' },
          // Terminal por la que se cobró un Recibo Provisional SIMPLE con
          // tarjeta (formaPago 'CREDITO' | 'DEBITO'); mismo catálogo que
          // BANCO_A_TERMINAL en utils/cierreCajaTerminales.js, para sumarla al
          // Cierre de Caja (ver POST /:id/pagos). El pago Combinado lleva su
          // propia terminal en `combinado.banco`.
          banco: { type: String, enum: TERMINALES_TARJETA_CAJA, default: '' },
          // Presente solo si formaPago === 'COMBINADO': desglose del monto en
          // pesos por método (su suma es el montoPesos del pago).
          combinado: {
            credito: { type: Number, default: 0 },
            efectivo: { type: Number, default: 0 },
            // Dólares dentro del Efectivo combinado (con su propia conversión
            // a pesos vía pago.tipoCambio); los demás métodos son solo pesos.
            efectivoDolares: { type: Number, default: 0 },
            debito: { type: Number, default: 0 },
            cheque: { type: Number, default: 0 },
            transferencia: { type: Number, default: 0 },
            // Terminal por la que se cobró la parte de T. Crédito/T. Débito de
            // este combinado; mismo catálogo que BANCO_A_TERMINAL en
            // utils/cierreCajaTerminales.js, para poder sumarla al Cierre de
            // Caja (ver POST /:id/pagos en routes/cajas.js).
            banco: { type: String, enum: TERMINALES_TARJETA_CAJA, default: '' },
          },
        },

        // Recibo de Dólares: se genera automáticamente cuando el pago incluye
        // montoDolares > 0, sin importar el comprobante o tipoPago.
        reciboDolares: {
          numero: { type: Number },
        },

        // Presente solo si este pago usó saldo a favor del cliente (ver
        // POST /:id/pagos en cajas.js): monto ya incluido en `monto` de
        // arriba, deducido atómicamente de Cliente.saldoAFavor vía
        // utils/anticiposCliente.js. `movimientoId` liga al AnticipoCliente
        // tipo USO correspondiente, para poder revertirlo si este pago se
        // cancela (ver POST /:id/pagos/:pagoId/cancelar).
        saldoAplicado: {
          monto: { type: Number, default: 0 },
          movimientoId: { type: Schema.Types.ObjectId, ref: 'AnticipoCliente', default: null },
          // Desglose FIFO de con qué forma(s) de pago se depositó originalmente
          // el saldo que se está aplicando aquí (ver calcularOrigenSaldo en
          // utils/anticiposCliente.js). formaPago null = dinero reembolsado de
          // un uso previo, cuyo depósito original ya no se puede rastrear.
          origenes: [
            {
              formaPago: { type: String, enum: ['EFECTIVO', 'CREDITO', 'DEBITO', 'CHEQUE', 'TRANSFERENCIA'], default: null },
              monto: { type: Number, default: 0 },
            },
          ],
        },
      },
    ],

    // ===== Cajas: Descuentos (globales a la orden o sobre una pieza/servicio) =====
    descuentos: [
      {
        tipo: { type: String, enum: ['PORCENTAJE', 'MONTO'], default: 'MONTO' },
        valor: { type: Number, default: 0 },
        motivo: { type: String, default: '' },
        activo: { type: Boolean, default: true },
        aplicadoPor: { type: String, default: '' },
        fecha: { type: Date, default: null },
        // null = descuento global a toda la orden; si trae valor, referencia
        // el _id de la partida en ventaCliente sobre la que aplica.
        lineaId: { type: Schema.Types.ObjectId, default: null },
      },
    ],

    // ===== Imágenes adjuntas a la orden (fotos del vehículo, daños, etc.) =====
    imagenes: [
      {
        filename: { type: String, default: "" },
        url: { type: String, default: "" },
        mimetype: { type: String, default: "" },
        size: { type: Number, default: 0 },
        fecha: { type: Date, default: Date.now },
        subidoPor: { type: String, default: "" },
      },
    ],
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);


vehiculoSchema.index({ 'garantia.estado': 1 });
vehiculoSchema.index({ 'pagos.notaVenta.numero': 1 }, { unique: true, sparse: true });
vehiculoSchema.index({ 'pagos.remision.numero': 1 }, { unique: true, sparse: true });
vehiculoSchema.index({ 'pagos.reciboProvisional.numero': 1 }, { unique: true, sparse: true });
vehiculoSchema.index({ 'pagos.reciboDolares.numero': 1 }, { unique: true, sparse: true });

// Generar número de Orden de Servicio automáticamente si no viene
vehiculoSchema.pre('save', function (next) {
  if (!this.ordenServicio || this.ordenServicio === "") {
    const ahora = new Date();
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const dd = String(ahora.getDate()).padStart(2, '0');
    const hh = String(ahora.getHours()).padStart(2, '0');
    const mi = String(ahora.getMinutes()).padStart(2, '0');
    const ss = String(ahora.getSeconds()).padStart(2, '0');

    // Ejemplo: OS-20251210-143015
    this.ordenServicio = `OS-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }
  next();
});


module.exports = mongoose.model('Vehiculo', vehiculoSchema);
module.exports.BANCOS_CAJA = BANCOS_CAJA;
module.exports.TIPO_NOTA = TIPO_NOTA;
