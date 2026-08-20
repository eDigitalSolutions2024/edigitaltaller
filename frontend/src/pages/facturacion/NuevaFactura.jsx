import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Dropdown from "../../components/Dropdown";
import { listOrdenesServicio, getVehiculoById } from "../../api/vehiculos";
import { updateCustomer } from "../../api/customers";
import { listConceptosPreset } from "../../api/conceptosPreset";
import { listClavesUnidad } from "../../api/clavesUnidad";
import { listFacturasCfdi } from "../../api/facturasCfdi";
import { generarVistaPreviaPDF } from "../../api/facturacion";
import api from "../../api/http";
import usePdfModal from "../../hooks/usePdfModal";
import useTipoCambioActual from "../../hooks/useTipoCambioActual";
import { REGIMEN_FISCAL_OPTIONS } from "../../utils/regimenFiscal";
import { calcularTotalesOrden } from "../../utils/cajaTotales";

/* =======================
   CATÁLOGOS
======================= */

const TIPOS_FACTURA = [
  {
    value: "factura",
    tipoComprobante: "I",
    icon: "🧾",
    label: "Factura",
    desc: "CFDI de Ingreso a partir de una o varias órdenes de servicio.",
  },
  {
    value: "notaCredito",
    tipoComprobante: "E",
    icon: "↩️",
    label: "Nota de crédito",
    desc: "CFDI de Egreso aplicado a una o varias facturas ya realizadas.",
  },
  {
    value: "complementoPago",
    tipoComprobante: "P",
    icon: "💳",
    label: "Complemento de pago",
    desc: "Recibo electrónico de pago de una o varias facturas.",
  },
];

const USO_CFDI = [
  { value: "G01", label: "G01 - Adquisición de mercancías." },
  { value: "G02", label: "G02 - Devoluciones, descuentos o bonificaciones." },
  { value: "G03", label: "G03 - Gastos en general." },
  { value: "I01", label: "I01 - Construcciones." },
  { value: "I02", label: "I02 - Mobiliario y equipo de oficina por inversiones." },
  { value: "I03", label: "I03 - Equipo de transporte." },
  { value: "I04", label: "I04 - Equipo de computo y accesorios." },
  { value: "I05", label: "I05 - Dados, troqueles, moldes, matrices y herramental." },
  { value: "I06", label: "I06 - Comunicaciones telefónicas." },
  { value: "I07", label: "I07 - Comunicaciones satelitales." },
  { value: "I08", label: "I08 - Otra maquinaria y equipo." },
  { value: "D01", label: "D01 - Honorarios médicos, dentales y gastos hospitalarios." },
  { value: "D02", label: "D02 - Gastos médicos por incapacidad o discapacidad." },
  { value: "D03", label: "D03 - Gastos funerales." },
  { value: "D04", label: "D04 - Donativos." },
  { value: "D05", label: "D05 - Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)." },
  { value: "D06", label: "D06 - Aportaciones voluntarias al SAR." },
  { value: "D07", label: "D07 - Primas por seguros de gastos médicos." },
  { value: "D08", label: "D08 - Gastos de transportación escolar obligatoria." },
  { value: "D09", label: "D09 - Depósitos en cuentas para el ahorro, primas con base en planes de pensiones." },
  { value: "D10", label: "D10 - Pagos por servicios educativos (colegiaturas)." },
  { value: "S01", label: "S01 - Sin efectos fiscales." },
  { value: "CP01", label: "CP01 - Pagos" },
  { value: "CN01", label: "CN01 - Nómina" },
];

const FORMA_PAGO = [
  { value: "01", label: "01 - Efectivo" },
  { value: "02", label: "02 - Cheque nominativo" },
  { value: "03", label: "03 - Transferencia electrónica de fondos" },
  { value: "04", label: "04 - Tarjeta de crédito" },
  { value: "05", label: "05 - Monedero electrónico" },
  { value: "06", label: "06 - Dinero electrónico" },
  { value: "08", label: "08 - Vales de despensa" },
  { value: "12", label: "12 - Dación en pago" },
  { value: "13", label: "13 - Pago por subrogación" },
  { value: "14", label: "14 - Pago por consignación" },
  { value: "15", label: "15 - Condonación" },
  { value: "17", label: "17 - Compensación" },
  { value: "23", label: "23 - Novación" },
  { value: "24", label: "24 - Confusión" },
  { value: "25", label: "25 - Remisión de deuda" },
  { value: "26", label: "26 - Prescripción o caducidad" },
  { value: "27", label: "27 - A satisfacción del acreedor" },
  { value: "28", label: "28 - Tarjeta de débito" },
  { value: "29", label: "29 - Tarjeta de servicios" },
  { value: "30", label: "30 - Aplicación de anticipos" },
  { value: "31", label: "31 - Intermediario pagos" },
  { value: "99", label: "99 - Por definir" },
];

/* Clave de unidad del SAT (c_ClaveUnidad). Viene del catálogo administrable en
   Configuración fiscal (claves-unidad); el select muestra "clave - descripción"
   y de paso llena el campo Unidad del CFDI, que es esa misma descripción. */
const unidadDeClave = (catalogo, clave, fallback = "") =>
  catalogo.find((u) => u.clave === clave)?.descripcion || fallback;

const IVA_OPTS = [
  { value: 0, label: "0%" },
  { value: 0.08, label: "8%" },
  { value: 0.16, label: "16%" },
];

const METODO_PAGO = [
  { value: "PUE", label: "PUE - Pago en una sola exhibición" },
  { value: "PPD", label: "PPD - Pago en parcialidades o diferido" },
];

const CONCEPTO_VACIO = {
  cantidad: 1,
  unidad: "Servicio",
  cProdServ: "",
  cUnidad: "E48",
  descripcion: "",
  valorUnitario: "",
};

// RFC/Régimen/CP alimentan el atributo DomicilioFiscalReceptor del CFDI; la
// calle/colonia/ciudad/estado no las exige el SAT en el XML pero sí aparecen
// impresas en el PDF de la factura (formatDireccion en el backend), así que
// también se piden aquí si faltan.
const FISCAL_DRAFT_VACIO = {
  rfc: "",
  regimenFiscal: "",
  codigoPostalFiscal: "",
  calle: "",
  numeroExterior: "",
  numeroInterior: "",
  colonia: "",
  ciudad: "",
  estado: "",
};

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fechaCorta(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function hoyISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* Select reutilizable de clave de unidad. Si el concepto trae una clave que no
   está en el catálogo (capturada antes o importada, o el catálogo aún no la
   tiene dada de alta), se agrega como opción para no perderla al editar. */
function SelectClaveUnidad({ value, disabled, onChange, opciones, size = "", placeholder = "" }) {
  const fueraDeCatalogo = value && !opciones.some((u) => u.clave === value);

  return (
    <Dropdown
      className={`form-select ${size}`}
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder && <Dropdown.Option value="">{placeholder}</Dropdown.Option>}
      {fueraDeCatalogo && <Dropdown.Option value={value}>{value}</Dropdown.Option>}
      {opciones.map((u) => (
        <Dropdown.Option key={u._id || u.clave} value={u.clave}>
          {u.clave} - {u.descripcion}
        </Dropdown.Option>
      ))}
    </Dropdown>
  );
}

/* Select de clave de producto/servicio del SAT, a partir del catálogo
   administrable en Configuración fiscal (conceptos preset). */
function SelectCProdServ({ value, disabled, onChange, opciones, size = "", placeholder = "" }) {
  const fueraDeCatalogo = value && !opciones.some((p) => p.cProdServ === value);

  return (
    <Dropdown
      className={`form-select ${size}`}
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder && <Dropdown.Option value="">{placeholder}</Dropdown.Option>}
      {fueraDeCatalogo && <Dropdown.Option value={value}>{value}</Dropdown.Option>}
      {opciones.map((p) => (
        <Dropdown.Option key={p._id || p.cProdServ} value={p.cProdServ}>
          {p.cProdServ} - {p.descripcion}
        </Dropdown.Option>
      ))}
    </Dropdown>
  );
}

/* =======================
   COMPONENTE
======================= */

export default function NuevaFactura() {
  const navigate = useNavigate();
  // Identificador local (no persiste al backend) para poder seleccionar y
  // editar en lote cada renglón de conceptos, sin depender de su índice.
  const nextKeyRef = useRef(1);

  /* ==========
     TIPO DE FACTURA
  ========== */
  const [tipoFactura, setTipoFactura] = useState("");

  const tipoInfo = TIPOS_FACTURA.find((t) => t.value === tipoFactura) || null;
  const esFactura = tipoFactura === "factura";
  const esNotaCredito = tipoFactura === "notaCredito";
  const esComplementoPago = tipoFactura === "complementoPago";

  /* ==========
     SECCIÓN 2A) ÓRDENES DE SERVICIO / CLIENTE (tipo: factura)
     Una factura puede agrupar varias órdenes, siempre del mismo cliente.
  ========== */
  const [qOrden, setQOrden] = useState("");
  const [loadingOrden, setLoadingOrden] = useState(false);
  const [optsOrdenes, setOptsOrdenes] = useState([]);
  const [showOrdenes, setShowOrdenes] = useState(false);
  const [ordenes, setOrdenes] = useState([]);
  const [cliente, setCliente] = useState(null);

  const [fiscalDraft, setFiscalDraft] = useState(FISCAL_DRAFT_VACIO);
  const [guardandoFiscal, setGuardandoFiscal] = useState(false);

  /* ==========
     SECCIÓN 2B) FACTURAS EMITIDAS (tipos: notaCredito / complementoPago)
  ========== */
  const [qFactura, setQFactura] = useState("");
  const [loadingFacturas, setLoadingFacturas] = useState(false);
  const [optsFacturas, setOptsFacturas] = useState([]);
  const [showFacturas, setShowFacturas] = useState(false);

  // Nota de crédito: una o varias facturas acreditadas
  const [facturasNC, setFacturasNC] = useState([]);

  // Complemento de pago: varias facturas con importe pagado editable
  const [facturasPago, setFacturasPago] = useState([]); // [{ doc, importePagado }]

  const nombreCompleto = (c) =>
    [c?.nombre, c?.apellidoPaterno, c?.apellidoMaterno].filter(Boolean).join(" ");

  const nombreFiscalCliente = (c) => {
    if (!c) return "";
    // apellidoPaterno/apellidoMaterno son de "Particular"; en empresas/gobierno
    // no se usan como respaldo porque en registros migrados/viejos pueden
    // quedar huérfanos con datos que ya no aplican.
    if (c.tipoCliente === "Empresa Privada" || c.tipoCliente === "Empresa Arrendadora") {
      return c.empresa?.razonSocial || c.nombre || "";
    }
    if (c.tipoCliente === "Empresa Gobierno") {
      return c.gobierno?.nombreGobierno || c.nombre || "";
    }
    return nombreCompleto(c);
  };

  const resetTodo = () => {
    setOrdenes([]);
    setCliente(null);
    setQOrden("");
    setShowOrdenes(false);
    setOptsOrdenes([]);
    setOrdenDesglosada("");
    setFiscalDraft(FISCAL_DRAFT_VACIO);

    setQFactura("");
    setOptsFacturas([]);
    setShowFacturas(false);
    setFacturasNC([]);
    setFacturasPago([]);

    setConceptos([]);
    setConceptosSeleccionados([]);
    setBulkCUnidad("");
    setBulkCProdServ("");
    cancelEdit();
    setXmlSigned("");
    setCadenaOriginal("");
    setSello("");
  };

  const onPickTipo = (t) => {
    if (t.value === tipoFactura) return;
    setTipoFactura(t.value);
    resetTodo();

    // Defaults del comprobante según el tipo
    if (t.value === "factura") {
      setUsoCfdi("G03");
      setMetodoPago("PUE");
      setFormaPago("03");
    } else if (t.value === "notaCredito") {
      setUsoCfdi("G02");
      setMetodoPago("PUE");
      setFormaPago("15");
    } else {
      setUsoCfdi("CP01");
      setMetodoPago("PUE");
      setFormaPago("03");
      setFechaPago(hoyISO());
    }
  };

  /* Búsqueda de órdenes de servicio (tipo: factura).
     Solo se facturan órdenes cerradas, así que la búsqueda las filtra en el
     backend con estado=CERRADA. */
  useEffect(() => {
    if (!esFactura) return;

    const t = setTimeout(async () => {
      const term = qOrden.trim();

      if (term.length < 2) {
        setOptsOrdenes([]);
        setShowOrdenes(false);
        return;
      }

      try {
        setLoadingOrden(true);
        const res = await listOrdenesServicio({
          search: term,
          estado: "CERRADA",
          // Ya con una orden agregada, las siguientes deben ser del mismo
          // cliente: una factura no puede mezclar receptores.
          ...(cliente?._id ? { cliente: cliente._id } : {}),
          limit: 15,
        });
        const yaAgregadas = new Set(ordenes.map((o) => o._id));
        setOptsOrdenes((res.data?.data || []).filter((o) => !yaAgregadas.has(o._id)));
        setShowOrdenes(true);
      } catch (e) {
        setOptsOrdenes([]);
      } finally {
        setLoadingOrden(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [qOrden, esFactura, cliente, ordenes]); // eslint-disable-line

  /* Búsqueda de facturas emitidas (tipos: notaCredito / complementoPago) */
  useEffect(() => {
    if (!esNotaCredito && !esComplementoPago) return;

    const t = setTimeout(async () => {
      const term = qFactura.trim();

      if (term.length < 1) {
        setOptsFacturas([]);
        setShowFacturas(false);
        return;
      }

      try {
        setLoadingFacturas(true);
        const res = await listFacturasCfdi({
          q: term,
          estatus: "generada",
          tipo: "factura",
          limit: 10,
        });

        // Ya agregadas: no deben volver a aparecer en la búsqueda.
        // Distinto cliente: una NC/complemento no puede mezclar receptores,
        // así que en cuanto hay una factura elegida se acota por su RFC.
        const facturasAgregadas = esNotaCredito ? facturasNC : facturasPago.map((f) => f.doc);
        const yaAgregadas = new Set(facturasAgregadas.map((f) => f._id));
        const rfcBase = facturasAgregadas[0]?.cliente?.rfc;

        const docs = (res.data?.docs || []).filter(
          (d) => !yaAgregadas.has(d._id) && (!rfcBase || d.cliente?.rfc === rfcBase)
        );

        setOptsFacturas(docs);
        setShowFacturas(true);
      } catch (e) {
        setOptsFacturas([]);
      } finally {
        setLoadingFacturas(false);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [qFactura, esNotaCredito, esComplementoPago, facturasNC, facturasPago]); // eslint-disable-line

  const direccionFiscalDeCliente = (c) => {
    const d = c?.facturacion?.direccion || c?.direccion || {};
    return {
      calle: d.calle || "",
      numeroExterior: d.numeroExterior || "",
      numeroInterior: d.numeroInterior || "",
      colonia: d.colonia || "",
      codigoPostal: d.codigoPostal || "",
      ciudad: d.ciudad || "",
      estado: d.estado || "",
    };
  };

  const datosFiscalesDeCliente = (c) =>
    c
      ? {
          _id: c._id,
          tipoCliente: c.tipoCliente,
          nombre: nombreFiscalCliente(c),
          rfc: c.rfc || "",
          regimenFiscal: c.regimenFiscal || c.facturacion?.regimenFiscal || "",
          codigoPostalFiscal:
            c.codigoPostalFiscal || c.facturacion?.direccion?.codigoPostal || "",
          direccion: direccionFiscalDeCliente(c),
          pais: c.pais || "",
        }
      : null;

  const agregarOrden = async (o) => {
    setQOrden("");
    setShowOrdenes(false);
    setOptsOrdenes([]);

    if (ordenes.some((x) => x._id === o._id)) {
      return alert("Esa orden de servicio ya está agregada a la factura.");
    }

    setLoadingOrden(true);
    try {
      const res = await getVehiculoById(o._id);
      const v = res.data?.vehiculo;
      if (!v) return alert("No se pudo cargar la orden de servicio.");

      const clienteOrden = datosFiscalesDeCliente(v.cliente);

      // Todas las órdenes de un mismo CFDI deben ser del mismo receptor.
      if (ordenes.length && cliente?._id && String(clienteOrden?._id) !== String(cliente._id)) {
        return alert(
          "Todas las órdenes de la factura deben ser del mismo cliente. " +
            `La orden ${v.ordenServicio} es de "${clienteOrden?.nombre || "otro cliente"}".`
        );
      }

      setOrdenes((prev) => [...prev, v]);

      // Las partidas ya autorizadas por el cliente en Cajas se pasan directo
      // a conceptos del CFDI, sin paso intermedio de selección/importación.
      const conceptosOrden = (v.ventaCliente || [])
        .filter((l) => l.autorizacionCliente === "SI")
        .map((l) => ({
          _key: nextKeyRef.current++,
          _origenOrdenId: v._id,
          cantidad: Number(l.cant) > 0 ? Number(l.cant) : 1,
          unidad: "",
          cProdServ: l.codigoSat || "",
          cUnidad: "",
          descripcion: l.concepto || l.descripcionSat || "",
          valorUnitario: Number(l.precioVenta || 0),
        }));
      if (conceptosOrden.length) {
        setConceptos((prev) => [...prev, ...conceptosOrden]);
      }

      if (!ordenes.length) {
        setCliente(clienteOrden);
        setFiscalDraft({
          rfc: clienteOrden?.rfc || "",
          regimenFiscal: clienteOrden?.regimenFiscal || "",
          codigoPostalFiscal: clienteOrden?.codigoPostalFiscal || "",
          calle: clienteOrden?.direccion?.calle || "",
          numeroExterior: clienteOrden?.direccion?.numeroExterior || "",
          numeroInterior: clienteOrden?.direccion?.numeroInterior || "",
          colonia: clienteOrden?.direccion?.colonia || "",
          ciudad: clienteOrden?.direccion?.ciudad || "",
          estado: clienteOrden?.direccion?.estado || "",
        });

        // El IVA del CFDI arranca con el mismo que se le cobró en la orden
        const ivaOrden = Number(v?.ivaVenta);
        if (IVA_OPTS.some((x) => x.value === ivaOrden / 100)) setIvaRate(ivaOrden / 100);

        setXmlSigned("");
        setCadenaOriginal("");
        setSello("");
      }
    } catch (e) {
      alert("No se pudo cargar la orden de servicio.");
    } finally {
      setLoadingOrden(false);
    }
  };

  const quitarOrden = (id) => {
    const restantes = ordenes.filter((o) => o._id !== id);
    setOrdenes(restantes);
    if (ordenDesglosada === id) setOrdenDesglosada("");
    if (!restantes.length) {
      setCliente(null);
      setFiscalDraft(FISCAL_DRAFT_VACIO);
    }

    // Se retiran también los conceptos que se auto-cargaron desde esta orden.
    const conceptosRestantes = conceptos.filter((c) => c._origenOrdenId !== id);
    setConceptos(conceptosRestantes);
    const clavesRestantes = new Set(conceptosRestantes.map((c) => c._key));
    setConceptosSeleccionados((prev) => prev.filter((k) => clavesRestantes.has(k)));
    cancelEdit();
  };

  /* ==========
     NOTA DE CRÉDITO: varias facturas acreditadas
  ========== */
  const conceptoDeFacturaNC = (doc) => ({
    _key: nextKeyRef.current++,
    cantidad: 1,
    unidad: "Actividad",
    cProdServ: "84111506",
    cUnidad: "ACT",
    descripcion: `NOTA DE CREDITO APLICADA A FACTURA ${(doc.serie || "") + (doc.folio || "")}`,
    valorUnitario: Number(doc.totales?.subtotal || 0),
    // Marca de origen: si se quita la factura, se retira también su concepto.
    _origenFacturaId: doc._id,
  });

  const agregarFacturaNC = (doc) => {
    setQFactura("");
    setShowFacturas(false);
    setOptsFacturas([]);

    if (facturasNC.some((f) => f._id === doc._id)) {
      return alert("Esa factura ya está agregada a la nota de crédito.");
    }

    const rfcBase = facturasNC[0]?.cliente?.rfc;
    if (rfcBase && doc.cliente?.rfc && doc.cliente.rfc !== rfcBase) {
      return alert("Todas las facturas de la nota de crédito deben ser del mismo cliente (mismo RFC).");
    }

    setFacturasNC((prev) => [...prev, doc]);
    setConceptos((prev) => [...prev, conceptoDeFacturaNC(doc)]);
    cancelEdit();
  };

  const quitarFacturaNC = (id) => {
    setFacturasNC((prev) => prev.filter((f) => f._id !== id));
    setConceptos((prev) => prev.filter((c) => c._origenFacturaId !== id));
    cancelEdit();
  };

  /* ==========
     COMPLEMENTO DE PAGO: varias facturas con importe
  ========== */
  const agregarFacturaPago = (doc) => {
    setQFactura("");
    setShowFacturas(false);
    setOptsFacturas([]);

    if (facturasPago.some((f) => f.doc._id === doc._id)) {
      return alert("Esa factura ya está agregada al complemento.");
    }

    const rfcBase = facturasPago[0]?.doc?.cliente?.rfc;
    if (rfcBase && doc.cliente?.rfc && doc.cliente.rfc !== rfcBase) {
      return alert("Todas las facturas del complemento deben ser del mismo cliente (mismo RFC).");
    }

    setFacturasPago((prev) => [
      ...prev,
      { doc, importePagado: Number(doc.totales?.total || 0) },
    ]);
  };

  const quitarFacturaPago = (id) => {
    setFacturasPago((prev) => prev.filter((f) => f.doc._id !== id));
  };

  const setImportePagado = (id, valor) => {
    setFacturasPago((prev) =>
      prev.map((f) => (f.doc._id === id ? { ...f, importePagado: valor } : f))
    );
  };

  /* ==========
     RECEPTOR (según el tipo)
  ========== */
  const receptor = useMemo(() => {
    if (esFactura) return cliente;

    const base = esNotaCredito ? facturasNC[0] : facturasPago[0]?.doc;
    if (!base) return null;

    return {
      _id: base.cliente?.clienteId || null,
      nombre: base.cliente?.nombre || "",
      rfc: base.cliente?.rfc || "",
      regimenFiscal: base.cliente?.regimenFiscal || "",
      codigoPostalFiscal: base.cliente?.codigoPostalFiscal || "",
      direccion: base.cliente?.direccion || {},
      pais: base.cliente?.pais || "",
    };
  }, [esFactura, esNotaCredito, cliente, facturasNC, facturasPago]);

  const faltanFiscales = useMemo(() => {
    if (!esFactura) return false;
    if (!cliente) return true;
    if (!cliente.rfc || !cliente.regimenFiscal || !cliente.codigoPostalFiscal) return true;
    // Número interior es opcional (no todos los domicilios lo tienen); el resto
    // de la dirección fiscal sí se exige porque se imprime en el PDF de la factura.
    const d = cliente.direccion || {};
    return !d.calle || !d.numeroExterior || !d.colonia || !d.ciudad || !d.estado;
  }, [esFactura, cliente]);

  const pasoBaseOk = useMemo(() => {
    if (esFactura) return ordenes.length > 0 && !!cliente && !faltanFiscales;
    if (esNotaCredito) return facturasNC.length > 0;
    if (esComplementoPago) return facturasPago.length > 0;
    return false;
  }, [esFactura, esNotaCredito, esComplementoPago, ordenes, cliente, faltanFiscales, facturasNC, facturasPago]);

  const guardarFiscalCliente = async () => {
    if (!cliente?._id) return;

    const rfc = String(fiscalDraft.rfc || "").trim().toUpperCase();
    const regimenFiscal = String(fiscalDraft.regimenFiscal || "").trim();
    const codigoPostalFiscal = String(fiscalDraft.codigoPostalFiscal || "").trim();
    const calle = String(fiscalDraft.calle || "").trim();
    const numeroExterior = String(fiscalDraft.numeroExterior || "").trim();
    const numeroInterior = String(fiscalDraft.numeroInterior || "").trim();
    const colonia = String(fiscalDraft.colonia || "").trim();
    const ciudad = String(fiscalDraft.ciudad || "").trim();
    const estado = String(fiscalDraft.estado || "").trim();

    if (!rfc || !regimenFiscal || !codigoPostalFiscal || !calle || !numeroExterior || !colonia || !ciudad || !estado) {
      return alert(
        "Completa RFC, régimen fiscal, CP fiscal y la dirección fiscal (calle, número exterior, colonia, ciudad y estado)."
      );
    }

    const direccion = { calle, numeroExterior, numeroInterior, colonia, codigoPostal: codigoPostalFiscal, ciudad, estado };

    setGuardandoFiscal(true);
    try {
      // requiereFacturacion deja los datos visibles y editables en el alta de
      // clientes; sin él, esa pantalla oculta la sección y su siguiente guardado
      // borraría el RFC que se acaba de capturar aquí. El backend se encarga de
      // reflejar régimen, CP y dirección también dentro de `facturacion`.
      await updateCustomer(cliente._id, {
        rfc,
        regimenFiscal,
        codigoPostalFiscal,
        direccion,
        requiereFacturacion: true,
      });
      setCliente((p) => ({ ...p, rfc, regimenFiscal, codigoPostalFiscal, direccion }));
    } catch (e) {
      alert(
        e?.response?.data?.error || "No se pudo guardar la información fiscal del cliente."
      );
    } finally {
      setGuardandoFiscal(false);
    }
  };

  /* ==========
     SECCIÓN 3) CONCEPTOS
     Los conceptos se agregan solos (costo de venta autorizado de las
     órdenes, o notas de crédito) o con "+ Agregar fila"; de ahí en adelante
     se editan y eliminan directo en la tabla "Conceptos agregados".
  ========== */
  const [conceptos, setConceptos] = useState([]);

  // El valor unitario puede ser 0 (partidas de cortesía con motivo justificado),
  // igual que lo acepta el generador de XML; solo se rechazan los negativos.
  const conceptoInvalido = (c) => {
    if (!String(c.descripcion || "").trim()) return "Pon una descripción.";
    if (!String(c.cProdServ || "").trim()) return "Falta la clave de producto/servicio (CProdServ).";
    if (!String(c.cUnidad || "").trim()) return "Falta la clave de unidad (CUnidad).";
    if (Number(c.cantidad) <= 0) return "Cantidad inválida.";
    if (!(Number(c.valorUnitario) >= 0)) return "V. Unit inválido.";
    return "";
  };

  const limpiaConcepto = (c) => ({
    cantidad: Number(c.cantidad),
    unidad: String(c.unidad || "").trim(),
    cProdServ: String(c.cProdServ || "").trim(),
    cUnidad: String(c.cUnidad || "").trim(),
    descripcion: String(c.descripcion || "").trim(),
    valorUnitario: Number(c.valorUnitario),
  });

  const delConcepto = (idx) => {
    const key = conceptos[idx]?._key;
    setConceptos((prev) => prev.filter((_, i) => i !== idx));
    setConceptosSeleccionados((prev) => prev.filter((k) => k !== key));
    if (editRow === idx) {
      setEditRow(-1);
      setEditDraft(null);
      setNuevoRowKey(null);
    }
  };

  const importeConcepto = (c) => Number(c.cantidad || 0) * Number(c.valorUnitario || 0);

  /* Selección de renglones, para rellenar CUnidad/CProdServ en lote */
  const [conceptosSeleccionados, setConceptosSeleccionados] = useState([]);
  const [bulkCUnidad, setBulkCUnidad] = useState("");
  const [bulkCProdServ, setBulkCProdServ] = useState("");

  const toggleConceptoSeleccionado = (key) => {
    setConceptosSeleccionados((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleTodosConceptos = () => {
    setConceptosSeleccionados((prev) =>
      prev.length === conceptos.length ? [] : conceptos.map((c) => c._key)
    );
  };

  // El CUnidad/CProdServ elegidos arriba de la tabla no se aplican solos:
  // se quedan en espera hasta que se confirmen con "Guardar".
  const puedeGuardarSeleccion =
    conceptosSeleccionados.length > 0 && (!!bulkCUnidad || !!bulkCProdServ);

  const guardarSeleccionEnLote = () => {
    if (!puedeGuardarSeleccion) return;

    const unidadTexto = bulkCUnidad ? unidadDeClave(clavesUnidad, bulkCUnidad) : null;
    const preset = bulkCProdServ ? presets.find((p) => p.cProdServ === bulkCProdServ) : null;

    const aplicar = (c) => {
      if (!conceptosSeleccionados.includes(c._key)) return c;
      return {
        ...c,
        ...(bulkCUnidad ? { cUnidad: bulkCUnidad, unidad: unidadTexto || c.unidad } : {}),
        ...(bulkCProdServ
          ? { cProdServ: bulkCProdServ, descripcion: preset?.descripcion || c.descripcion }
          : {}),
      };
    };

    setConceptos((prev) => prev.map(aplicar));
    setEditDraft((prev) => (prev ? aplicar(prev) : prev));
    setBulkCUnidad("");
    setBulkCProdServ("");
  };

  /* Edición en línea de la lista de conceptos */
  const [editRow, setEditRow] = useState(-1);
  const [editDraft, setEditDraft] = useState(null);
  // Renglón agregado con "+ Agregar fila" que aún no se ha guardado: si se
  // cancela la edición, se descarta en vez de dejarlo vacío en la tabla.
  const [nuevoRowKey, setNuevoRowKey] = useState(null);

  const startEdit = (idx) => {
    setEditRow(idx);
    setEditDraft({ ...conceptos[idx] });
  };

  const cancelEdit = () => {
    if (nuevoRowKey != null) {
      setConceptos((prev) => prev.filter((c) => c._key !== nuevoRowKey));
      setNuevoRowKey(null);
    }
    setEditRow(-1);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editDraft) return;
    const error = conceptoInvalido(editDraft);
    if (error) return alert(error);

    const clean = { ...editDraft, ...limpiaConcepto(editDraft) };
    setConceptos((prev) => prev.map((x, i) => (i === editRow ? clean : x)));
    setNuevoRowKey(null);
    setEditRow(-1);
    setEditDraft(null);
  };

  const agregarFilaVacia = () => {
    if (!pasoBaseOk) return;
    const key = nextKeyRef.current++;
    const nueva = { _key: key, ...CONCEPTO_VACIO };
    setEditRow(conceptos.length);
    setEditDraft(nueva);
    setNuevoRowKey(key);
    setConceptos((prev) => [...prev, nueva]);
  };

  /* Catálogo de conceptos SAT (configuración fiscal): alimenta el autocompletado
     de la clave de producto/servicio. */
  const [presets, setPresets] = useState([]);

  useEffect(() => {
    listConceptosPreset()
      .then((r) => setPresets(r.data?.data || []))
      .catch(() => setPresets([]));
  }, []);

  /* Catálogo de claves de unidad SAT (configuración fiscal): alimenta el
     select de CUnidad de cada concepto. */
  const [clavesUnidad, setClavesUnidad] = useState([]);

  useEffect(() => {
    listClavesUnidad()
      .then((r) => setClavesUnidad(r.data?.data || []))
      .catch(() => setClavesUnidad([]));
  }, []);

  /* ==========
     SECCIÓN 4) DATOS DEL COMPROBANTE
  ========== */
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [ivaRate, setIvaRate] = useState(0.16);
  const [metodoPago, setMetodoPago] = useState("PUE");
  const [formaPago, setFormaPago] = useState("03");
  const [moneda, setMoneda] = useState("MXN");
  const [tipoCambio, setTipoCambio] = useState("");
  const { tipoCambio: tipoCambioConfig, loading: cargandoTipoCambio } = useTipoCambioActual();
  const [oc, setOc] = useState("");
  const [comentarios, setComentarios] = useState("");

  const [aplicarRetencionIsr, setAplicarRetencionIsr] = useState(false);
  const isrRate = 0.0125;

  // Complemento de pago
  const [fechaPago, setFechaPago] = useState(hoyISO());

  const subtotal = useMemo(
    () => conceptos.reduce((sum, c) => sum + importeConcepto(c), 0),
    [conceptos]
  );
  const iva = useMemo(() => subtotal * Number(ivaRate || 0), [subtotal, ivaRate]);
  const isr = useMemo(
    () => (aplicarRetencionIsr ? subtotal * isrRate : 0),
    [subtotal, aplicarRetencionIsr]
  );
  const total = useMemo(() => subtotal + iva - isr, [subtotal, iva, isr]);

  const montoPago = useMemo(
    () => facturasPago.reduce((s, f) => s + Number(f.importePagado || 0), 0),
    [facturasPago]
  );

  const saldoTotalPago = useMemo(
    () => facturasPago.reduce((s, f) => s + Number(f.doc.totales?.total || 0), 0),
    [facturasPago]
  );

  const totalNC = useMemo(
    () => facturasNC.reduce((s, f) => s + Number(f.totales?.total || 0), 0),
    [facturasNC]
  );

  useEffect(() => {
    if (moneda === "USD") {
      setTipoCambio(tipoCambioConfig ? String(tipoCambioConfig) : "");
    } else {
      setTipoCambio("");
    }
  }, [moneda, tipoCambioConfig]);

  /* Resumen de cada orden ("cuánto fue al final").
     Usa el mismo cálculo que Cajas (ivaVenta + descuentos) para que la factura
     no muestre un total distinto al que se le cobró al cliente. */
  const resumenPorOrden = useMemo(
    () =>
      ordenes.map((o) => ({
        orden: o,
        lineas: o.ventaCliente || [],
        autorizados: (o.ventaCliente || []).filter((v) => v.autorizacionCliente === "SI").length,
        ...calcularTotalesOrden(o),
      })),
    [ordenes]
  );

  const resumenGlobal = useMemo(() => {
    if (!resumenPorOrden.length) return null;
    return resumenPorOrden.reduce(
      (acc, r) => ({
        subtotal: acc.subtotal + r.subtotal,
        ivaMonto: acc.ivaMonto + r.ivaMonto,
        descuentoMonto: acc.descuentoMonto + r.descuentoMonto,
        totalOrden: acc.totalOrden + r.totalOrden,
        autorizados: acc.autorizados + r.autorizados,
      }),
      { subtotal: 0, ivaMonto: 0, descuentoMonto: 0, totalOrden: 0, autorizados: 0 }
    );
  }, [resumenPorOrden]);

  const [ordenDesglosada, setOrdenDesglosada] = useState("");

  /* Anticipos y remisiones vigentes de las órdenes seleccionadas: hay que
     poder cancelarlos para que la orden pase a factura. */
  const comprobantesPorCancelar = useMemo(
    () =>
      ordenes.flatMap((o) =>
        (o.pagos || [])
          .filter((p) => !p.cancelado && (p.tipoPago === "ANTICIPO" || p.comprobante === "REMISION"))
          .map((p) => ({ ordenId: o._id, ordenServicio: o.ordenServicio, pago: p }))
      ),
    [ordenes]
  );

  const puedePreview = useMemo(() => {
    if (!pasoBaseOk) return false;

    if (esComplementoPago) {
      if (!fechaPago) return false;
      return facturasPago.length > 0 && facturasPago.every((f) => Number(f.importePagado) > 0);
    }

    if (conceptos.length === 0) return false;
    if (moneda === "USD" && !Number(tipoCambio || 0)) return false;
    return true;
  }, [pasoBaseOk, esComplementoPago, fechaPago, facturasPago, conceptos, moneda, tipoCambio]);

  /* ==========
     PAYLOAD COMÚN
  ========== */
  const buildPayload = () => {
    const relacionadas = esNotaCredito
      ? facturasNC.map((f) => ({
          facturaId: f._id,
          serie: f.serie || "",
          folio: f.folio || "",
          total: Number(f.totales?.total || 0),
        }))
      : esComplementoPago
      ? facturasPago.map((f) => ({
          facturaId: f.doc._id,
          serie: f.doc.serie || "",
          folio: f.doc.folio || "",
          total: Number(f.doc.totales?.total || 0),
          saldoAnterior: Number(f.doc.totales?.total || 0),
          importePagado: Number(f.importePagado || 0),
          saldoInsoluto: Math.max(
            Number(f.doc.totales?.total || 0) - Number(f.importePagado || 0),
            0
          ),
          numParcialidad: 1,
        }))
      : [];

    const ordenesPayload =
      esFactura
        ? ordenes.map((o) => ({
            _id: o._id,
            ordenServicio: o.ordenServicio,
            marca: o.marca || "",
            modelo: o.modelo || "",
            anio: o.anio || "",
            serie: o.serie || "",
            placas: o.placas || "",
            kmsMillas: o.kmsMillas || "",
            sinVehiculo: !!o.sinVehiculo,
          }))
        : [];

    return {
      tipoFactura,
      cliente: receptor,
      // `orden` (singular) se conserva para el historial y los reportes que ya
      // lo leían; `ordenes` lleva la lista completa.
      orden: ordenesPayload[0] || null,
      ordenes: ordenesPayload,
      conceptos: esComplementoPago ? [] : conceptos.map(limpiaConcepto),
      relacionadas,
      pago: esComplementoPago
        ? { fechaPago, formaPago, monto: montoPago }
        : null,
      cfdi: {
        tipoComprobante: tipoInfo?.tipoComprobante || "I",
        usoCfdi,
        ivaRate: Number(ivaRate),
        metodoPago,
        formaPago,
        moneda: esComplementoPago ? "MXN" : moneda,
        tipoCambio: moneda === "USD" ? Number(tipoCambio || 0) : null,
        oc,
        comentarios,
        aplicarRetencionIsr: esFactura ? aplicarRetencionIsr : false,
        isrRate,
      },
    };
  };

  /* ==========
     PREVIEW PDF
  ========== */
  const { pdfModal, abrirPdf } = usePdfModal();
  const [pdfLoading, setPdfLoading] = useState(false);

  // Sin CProdServ/CUnidad el CFDI queda inválido para el SAT: se bloquea la
  // generación (PDF y XML) en vez de dejar que falle hasta el timbrado.
  const conceptosSinSat = () =>
    esComplementoPago ? 0 : conceptos.filter((c) => !c.cProdServ || !c.cUnidad).length;

  const avisarSiFaltaSat = () => {
    const faltantes = conceptosSinSat();
    if (!faltantes) return false;
    alert(
      `${faltantes} concepto(s) no tienen CProdServ o CUnidad.\n\n` +
        "Complétalos en \"Conceptos agregados\" antes de generar el PDF o el XML."
    );
    return true;
  };

  const onPreviewPDF = async () => {
    if (!puedePreview) return alert("Completa la información antes de generar la vista previa.");
    if (avisarSiFaltaSat()) return;
    try {
      setPdfLoading(true);
      const res = await generarVistaPreviaPDF(buildPayload());
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      abrirPdf(
        url,
        "vista-previa.pdf",
        `Vista previa — ${tipoInfo?.label || "Factura"} (sin timbrado)`,
        () => URL.revokeObjectURL(url)
      );
    } catch (e) {
      console.error(e);
      alert("No se pudo generar la vista previa.");
    } finally {
      setPdfLoading(false);
    }
  };

  /* ==========
     GENERAR XML
  ========== */
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlSigned, setXmlSigned] = useState("");
  const [cadenaOriginal, setCadenaOriginal] = useState("");
  const [sello, setSello] = useState("");

  const onGenerarXML = async () => {
    if (!puedePreview) return alert("Completa la información antes de generar el XML.");
    if (avisarSiFaltaSat()) return;

    // El anticipo/remisión vigente de cada orden (si lo hay) se cancela
    // automáticamente en el backend al generar la factura (ver aviso
    // informativo más abajo): ya no hace falta cancelarlo a mano antes.
    try {
      setXmlLoading(true);

      const res = await api.post("/generar-xml/xml", buildPayload());

      if (!res?.data?.ok) {
        return alert(res?.data?.error || "No se pudo generar XML.");
      }

      const data = res.data.data;
      setXmlSigned(data.xmlSigned || "");
      setCadenaOriginal(data.cadenaOriginal || "");
      setSello(data.sello || "");

      if (data.xmlSigned) {
        alert("✅ XML generado y guardado en el sistema.");
        if (data.persistWarning) alert(data.persistWarning);
      } else {
        alert("XML generado, pero no llegó el xmlSigned.");
      }
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Error al generar XML.";
      alert(msg);
    } finally {
      setXmlLoading(false);
    }
  };

  /* ==========
     UI helpers
  ========== */
  const disabledSteps = !pasoBaseOk;

  const placeholderBusqueda = esFactura
    ? "Busca una orden cerrada por folio, placas, serie o cliente…"
    : esComplementoPago
    ? "Busca facturas por folio, cliente, RFC u orden…"
    : "Busca las facturas por folio, cliente, RFC u orden…";

  const CajaResumen = ({ titulo, valor, sub, onClick, abierto }) => (
    <div className="col-6 col-md-3">
      <div
        className={`border rounded p-3 text-center h-100 ${
          onClick ? "bg-white border-danger" : "bg-light"
        }`}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        style={onClick ? { cursor: "pointer" } : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (onClick && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="text-muted small text-uppercase">{titulo}</div>
        <div className="fw-bold fs-5">{valor}</div>
        {sub && <div className="text-muted small">{sub}</div>}
        {onClick && (
          <div className="small text-danger fw-semibold mt-1">
            {abierto ? "Ocultar desglose ▴" : "Ver desglose ▾"}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1400 }}>
      {/* ======================
          SECCIÓN 1) TÍTULO + REGRESAR
      ====================== */}
      <div className="d-flex align-items-center gap-3 mb-3">
        <button
          className="btn btn-outline-secondary"
          onClick={() => navigate("/facturacion")}
          title="Regresar al panel de facturación"
        >
          ← Regresar
        </button>
        <h2 className="mb-0">Nueva Factura</h2>
      </div>

      {/* Tipo de factura (se elige antes de los conceptos) */}
      <div className="card p-3 mb-3">
        <h5 className="mb-1">Tipo de factura</h5>
        <div className="text-muted small mb-3">
          Selecciona el tipo de comprobante antes de capturar los conceptos.
        </div>

        <div className="row g-3">
          {TIPOS_FACTURA.map((t) => {
            const activo = tipoFactura === t.value;
            return (
              <div className="col-12 col-md-4" key={t.value}>
                <button
                  type="button"
                  onClick={() => onPickTipo(t)}
                  className={`w-100 text-start border rounded p-3 h-100 ${
                    activo ? "border-danger bg-danger bg-opacity-10" : "bg-white"
                  }`}
                  style={{ cursor: "pointer" }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    <b>{t.label}</b>
                    <span className="badge text-bg-secondary ms-auto">
                      {t.tipoComprobante}
                    </span>
                  </div>
                  <div className="text-muted small mt-2">{t.desc}</div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {!tipoFactura && (
        <div className="alert alert-info">
          Elige un tipo de factura para comenzar.
        </div>
      )}

      {/* ======================
          SECCIÓN 2) BÚSQUEDA (centrada)
      ====================== */}
      {tipoFactura && (
        <div className="card p-3 mb-3">
          <div className="mx-auto w-100" style={{ maxWidth: 720 }}>
            <h5 className="text-center mb-1">
              {esFactura
                ? "Órdenes de servicio"
                : esNotaCredito
                ? "Facturas a acreditar"
                : "Facturas a pagar"}
            </h5>
            <div className="text-muted small text-center mb-3">
              {esFactura
                ? "Solo se listan órdenes cerradas. Puedes agregar varias del mismo cliente."
                : "Puedes agregar varias facturas del mismo cliente."}
            </div>

            {/* Búsqueda de ÓRDENES (factura) */}
            {esFactura && (
              <div className="position-relative">
                <input
                  className="form-control form-control-lg"
                  value={qOrden}
                  placeholder={placeholderBusqueda}
                  onChange={(e) => setQOrden(e.target.value)}
                  onFocus={() => optsOrdenes.length && setShowOrdenes(true)}
                />

                {showOrdenes && (
                  <div
                    className="list-group position-absolute w-100"
                    style={{ zIndex: 20, maxHeight: 300, overflow: "auto" }}
                  >
                    {loadingOrden && <div className="list-group-item">Buscando…</div>}

                    {!loadingOrden && optsOrdenes.length === 0 && (
                      <div className="list-group-item">Sin órdenes cerradas para esa búsqueda</div>
                    )}

                    {!loadingOrden &&
                      optsOrdenes.map((o) => (
                        <button
                          type="button"
                          key={o._id}
                          className="list-group-item list-group-item-action"
                          onClick={() => agregarOrden(o)}
                        >
                          <div className="fw-bold">{o.ordenServicio}</div>
                          <div style={{ fontSize: 13, opacity: 0.8 }}>
                            {nombreFiscalCliente(o.cliente) || "Sin cliente"} · {o.marca || "—"}{" "}
                            {o.modelo || ""} · Placas: {o.placas || "—"} · {o.estadoOrden}
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {esFactura && loadingOrden && (
              <div className="mt-2 text-muted text-center">Cargando orden…</div>
            )}

            {/* Búsqueda de FACTURAS (NC / complemento) */}
            {(esNotaCredito || esComplementoPago) && (
              <div className="position-relative">
                <input
                  className="form-control form-control-lg"
                  value={qFactura}
                  placeholder={placeholderBusqueda}
                  onChange={(e) => setQFactura(e.target.value)}
                  onFocus={() => optsFacturas.length && setShowFacturas(true)}
                />

                {showFacturas && (
                  <div
                    className="list-group position-absolute w-100"
                    style={{ zIndex: 20, maxHeight: 300, overflow: "auto" }}
                  >
                    {loadingFacturas && <div className="list-group-item">Buscando…</div>}

                    {!loadingFacturas && optsFacturas.length === 0 && (
                      <div className="list-group-item">Sin resultados</div>
                    )}

                    {!loadingFacturas &&
                      optsFacturas.map((d) => (
                        <button
                          type="button"
                          key={d._id}
                          className="list-group-item list-group-item-action"
                          onClick={() =>
                            esNotaCredito ? agregarFacturaNC(d) : agregarFacturaPago(d)
                          }
                        >
                          <div className="d-flex justify-content-between">
                            <span className="fw-bold">
                              {(d.serie || "") + (d.folio || "") || "(sin folio)"}
                            </span>
                            <span>{money(d.totales?.total)}</span>
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.8 }}>
                            {d.cliente?.nombre || "Sin cliente"} · RFC: {d.cliente?.rfc || "—"} ·{" "}
                            {fechaCorta(d.fecha)} · Orden: {d.orden?.ordenServicio || "—"}
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ===== CAJAS DE RESUMEN: FACTURA (órdenes) ===== */}
          {esFactura && ordenes.length > 0 && resumenGlobal && (
            <div className="mt-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">
                  {ordenes.length === 1
                    ? `Resumen de la orden ${ordenes[0].ordenServicio}`
                    : `Resumen de ${ordenes.length} órdenes`}
                </h6>
                <button className="btn btn-link btn-sm" onClick={resetTodo}>
                  Quitar todas
                </button>
              </div>

              <div className="row g-3">
                <CajaResumen
                  titulo="Cliente"
                  valor={cliente?.nombre || "—"}
                  sub={`RFC: ${cliente?.rfc || "—"}`}
                />
                <CajaResumen
                  titulo="Órdenes"
                  valor={ordenes.length}
                  sub={ordenes.map((o) => o.ordenServicio).join(", ")}
                />
                <CajaResumen
                  titulo="Servicios autorizados"
                  valor={resumenGlobal.autorizados}
                  sub={`Subtotal: ${money(resumenGlobal.subtotal)}`}
                />
                <CajaResumen
                  titulo="Total de las órdenes"
                  valor={money(resumenGlobal.totalOrden)}
                  sub={`IVA: ${money(resumenGlobal.ivaMonto)}`}
                />
              </div>

              {/* Órdenes agregadas, con su desglose de costo de venta */}
              <div className="table-responsive mt-3">
                <table className="table table-sm table-bordered align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Orden</th>
                      <th>Vehículo</th>
                      <th className="text-center">Autorizados</th>
                      <th className="text-end">Subtotal</th>
                      <th className="text-end">Total</th>
                      <th style={{ width: 210 }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenPorOrden.map((r) => (
                      <tr key={r.orden._id}>
                        <td className="fw-bold">{r.orden.ordenServicio}</td>
                        <td>
                          {r.orden.marca || "—"} {r.orden.modelo || ""} · Placas:{" "}
                          {r.orden.placas || "—"}
                        </td>
                        <td className="text-center">{r.autorizados}</td>
                        <td className="text-end">{money(r.subtotal)}</td>
                        <td className="text-end">{money(r.totalOrden)}</td>
                        <td>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() =>
                                setOrdenDesglosada((s) => (s === r.orden._id ? "" : r.orden._id))
                              }
                            >
                              {ordenDesglosada === r.orden._id ? "Ocultar" : "Ver desglose"}
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => quitarOrden(r.orden._id)}
                            >
                              Quitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Desglose de lo que se hizo en la orden (igual que Costo de Venta) */}
              {ordenDesglosada &&
                resumenPorOrden
                  .filter((r) => r.orden._id === ordenDesglosada)
                  .map((r) => (
                    <div className="mt-3" key={r.orden._id}>
                      <h6 className="fw-semibold mb-2">
                        Costo de Venta — {r.orden.ordenServicio}
                      </h6>
                      <div className="table-responsive">
                        <table className="table table-sm table-bordered align-middle">
                          <thead className="table-light text-center">
                            <tr>
                              <th style={{ width: 70 }}>Cant.</th>
                              <th>Concepto, Servicio y/o Reparación</th>
                              <th style={{ width: 150 }}>Precio Venta (Sin IVA)</th>
                              <th>Observaciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.lineas.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="text-center text-muted">
                                  Sin partidas de venta al cliente.
                                </td>
                              </tr>
                            ) : (
                              r.lineas.map((l, i) => (
                                <tr key={i}>
                                  <td className="text-center">{l.cant}</td>
                                  <td>
                                    {l.concepto}
                                    {l.autorizacionCliente !== "SI" && (
                                      <span className="badge text-bg-warning ms-2">
                                        {l.autorizacionCliente === "NO"
                                          ? "No autorizado"
                                          : "Pendiente"}
                                      </span>
                                    )}
                                  </td>
                                  <td className="text-end">{money(l.precioVenta)}</td>
                                  <td>{l.observaciones}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={2} className="text-end fw-bold">Sub Total:</td>
                              <td className="text-end fw-bold">{money(r.subtotal)}</td>
                              <td></td>
                            </tr>
                            <tr>
                              <td colSpan={2} className="text-end fw-bold">
                                IVA {r.ivaPct}%:
                              </td>
                              <td className="text-end fw-bold">{money(r.ivaMonto)}</td>
                              <td></td>
                            </tr>
                            {r.descuentoMonto > 0 && (
                              <tr>
                                <td colSpan={2} className="text-end fw-bold">Descuentos:</td>
                                <td className="text-end fw-bold text-danger">
                                  -{money(r.descuentoMonto)}
                                </td>
                                <td></td>
                              </tr>
                            )}
                            <tr>
                              <td colSpan={2} className="text-end fw-bold">Total:</td>
                              <td className="text-end fw-bold">{money(r.totalOrden)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}

              {/* Anticipos / remisiones vigentes: se cancelan solos al generar la factura */}
              {comprobantesPorCancelar.length > 0 && (
                <div className="alert alert-info mt-3 mb-0">
                  <div className="fw-semibold mb-2">
                    ℹ️ Estas órdenes tienen un anticipo o una remisión vigente en Cajas
                  </div>
                  <div className="small mb-2">
                    Se cancelarán automáticamente al generar la factura (el comprobante conserva su
                    folio, pero deja de contar como pago de la orden).
                  </div>

                  <div className="table-responsive">
                    <table className="table table-sm table-bordered align-middle bg-white mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Orden</th>
                          <th>Comprobante</th>
                          <th>Fecha</th>
                          <th className="text-end">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comprobantesPorCancelar.map(({ ordenServicio, pago }) => (
                          <tr key={pago._id}>
                            <td>{ordenServicio}</td>
                            <td>
                              {pago.comprobante === "REMISION"
                                ? `Remisión N°${pago.remision?.numero ?? "—"}`
                                : `Anticipo · Recibo Provisional N°${
                                    pago.reciboProvisional?.numero ?? "—"
                                  }`}
                            </td>
                            <td>{fechaCorta(pago.fecha)}</td>
                            <td className="text-end">{money(pago.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {faltanFiscales && (
                <div className="mt-3 p-2 border rounded">
                  <div className="text-danger mb-2">
                    ⚠️ Faltan datos fiscales del cliente. Captúralos para continuar.
                  </div>

                  <div className="row g-2">
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-1">RFC</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.rfc}
                        onChange={(e) =>
                          setFiscalDraft((p) => ({ ...p, rfc: e.target.value.toUpperCase() }))
                        }
                      />
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-1">Régimen fiscal</label>
                      <Dropdown
                        className="form-select-sm"
                        value={fiscalDraft.regimenFiscal}
                        onChange={(e) =>
                          setFiscalDraft((p) => ({ ...p, regimenFiscal: e.target.value }))
                        }
                      >
                        <Dropdown.Option value="">-- Seleccionar --</Dropdown.Option>
                        {REGIMEN_FISCAL_OPTIONS.map((o) => (
                          <Dropdown.Option key={o.value} value={o.value}>
                            {o.label}
                          </Dropdown.Option>
                        ))}
                      </Dropdown>
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-1">CP fiscal</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.codigoPostalFiscal}
                        onChange={(e) =>
                          setFiscalDraft((p) => ({ ...p, codigoPostalFiscal: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="row g-2 mt-1">
                    <div className="col-12 col-md-5">
                      <label className="form-label small mb-1">Calle</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.calle}
                        onChange={(e) => setFiscalDraft((p) => ({ ...p, calle: e.target.value }))}
                      />
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="form-label small mb-1">Núm. exterior</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.numeroExterior}
                        onChange={(e) =>
                          setFiscalDraft((p) => ({ ...p, numeroExterior: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="form-label small mb-1">Núm. interior</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.numeroInterior}
                        onChange={(e) =>
                          setFiscalDraft((p) => ({ ...p, numeroInterior: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label small mb-1">Colonia</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.colonia}
                        onChange={(e) => setFiscalDraft((p) => ({ ...p, colonia: e.target.value }))}
                      />
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label small mb-1">Ciudad</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.ciudad}
                        onChange={(e) => setFiscalDraft((p) => ({ ...p, ciudad: e.target.value }))}
                      />
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label small mb-1">Estado</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.estado}
                        onChange={(e) => setFiscalDraft((p) => ({ ...p, estado: e.target.value }))}
                      />
                    </div>
                  </div>

                  <button
                    className="btn btn-sm btn-danger mt-2"
                    onClick={guardarFiscalCliente}
                    disabled={guardandoFiscal}
                  >
                    {guardandoFiscal ? "Guardando..." : "Guardar datos fiscales del cliente"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ===== CAJAS DE RESUMEN: NOTA DE CRÉDITO ===== */}
          {esNotaCredito && facturasNC.length > 0 && (
            <div className="mt-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">Facturas seleccionadas</h6>
                <button className="btn btn-link btn-sm" onClick={resetTodo}>
                  Quitar todas
                </button>
              </div>

              <div className="row g-3">
                <CajaResumen
                  titulo="Facturas"
                  valor={facturasNC.length}
                  sub={facturasNC.map((f) => (f.serie || "") + (f.folio || "")).join(", ")}
                />
                <CajaResumen
                  titulo="Cliente"
                  valor={receptor?.nombre || "—"}
                  sub={`RFC: ${receptor?.rfc || "—"}`}
                />
                <CajaResumen
                  titulo="Subtotal facturado"
                  valor={money(facturasNC.reduce((s, f) => s + Number(f.totales?.subtotal || 0), 0))}
                  sub={`IVA: ${money(
                    facturasNC.reduce((s, f) => s + Number(f.totales?.iva || 0), 0)
                  )}`}
                />
                <CajaResumen
                  titulo="Total facturado"
                  valor={money(totalNC)}
                  sub="suma de las facturas acreditadas"
                />
              </div>

              <div className="table-responsive mt-3">
                <table className="table table-sm table-bordered align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Serie / Folio</th>
                      <th>Fecha</th>
                      <th>Orden</th>
                      <th className="text-end">Subtotal</th>
                      <th className="text-end">Total</th>
                      <th style={{ width: 110 }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturasNC.map((f) => (
                      <tr key={f._id}>
                        <td className="fw-bold">{(f.serie || "") + (f.folio || "") || "—"}</td>
                        <td>{fechaCorta(f.fecha)}</td>
                        <td>{f.orden?.ordenServicio || "—"}</td>
                        <td className="text-end">{money(f.totales?.subtotal)}</td>
                        <td className="text-end">{money(f.totales?.total)}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => quitarFacturaNC(f._id)}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== CAJAS DE RESUMEN: COMPLEMENTO DE PAGO ===== */}
          {esComplementoPago && facturasPago.length > 0 && (
            <div className="mt-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">Facturas del complemento</h6>
                <button className="btn btn-link btn-sm" onClick={resetTodo}>
                  Quitar todas
                </button>
              </div>

              <div className="row g-3">
                <CajaResumen
                  titulo="Facturas"
                  valor={facturasPago.length}
                  sub="seleccionadas"
                />
                <CajaResumen
                  titulo="Cliente"
                  valor={receptor?.nombre || "—"}
                  sub={`RFC: ${receptor?.rfc || "—"}`}
                />
                <CajaResumen
                  titulo="Saldo anterior"
                  valor={money(saldoTotalPago)}
                  sub="suma de facturas"
                />
                <CajaResumen
                  titulo="Importe del pago"
                  valor={money(montoPago)}
                  sub={`Saldo insoluto: ${money(Math.max(saldoTotalPago - montoPago, 0))}`}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================
          SECCIÓN 3) CONCEPTOS (factura / nota de crédito)
      ====================== */}
      {tipoFactura && !esComplementoPago && (
        <div className={`card p-3 mb-3 ${disabledSteps ? "opacity-50" : ""}`}>
          <h5>Conceptos</h5>

          {!pasoBaseOk && (
            <div className="alert alert-warning mt-2">
              {esFactura
                ? "Selecciona al menos una orden de servicio cerrada con datos fiscales completos para continuar."
                : "Selecciona las facturas sobre las que se aplicará la nota de crédito."}
            </div>
          )}

          {/* --- Conceptos agregados: selección + relleno en lote + edición --- */}
          <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mt-2 mb-2">
            <div>
              <h6 className="mb-0">Conceptos agregados</h6>
              <div className="text-muted small">
                Selecciona uno o varios con la casilla, elige su CUnidad y/o CProdServ y
                presiona Guardar para aplicárselos en lote.
              </div>
            </div>

            <div className="d-flex flex-wrap gap-2 align-items-end">
              <div>
                <label className="form-label small mb-1">CUnidad (selección)</label>
                <SelectClaveUnidad
                  value={bulkCUnidad}
                  disabled={disabledSteps || conceptosSeleccionados.length === 0}
                  opciones={clavesUnidad}
                  onChange={setBulkCUnidad}
                  size="form-select-sm"
                  placeholder="-- Elegir --"
                />
              </div>

              <div>
                <label className="form-label small mb-1">CProdServ (selección)</label>
                <SelectCProdServ
                  value={bulkCProdServ}
                  disabled={disabledSteps || conceptosSeleccionados.length === 0}
                  opciones={presets}
                  onChange={setBulkCProdServ}
                  size="form-select-sm"
                  placeholder="-- Elegir --"
                />
              </div>

              <button
                type="button"
                className="btn btn-sm btn-success"
                onClick={guardarSeleccionEnLote}
                disabled={disabledSteps || !puedeGuardarSeleccion}
              >
                Guardar
              </button>
            </div>
          </div>

          {/* Catálogo para el CProdServ de edición libre por renglón (el de
              arriba, en lote, usa el selector estricto SelectCProdServ). */}
          <datalist id="cprodserv-catalogo">
            {presets.map((p) => (
              <option key={p._id} value={p.cProdServ}>
                {p.descripcion}
              </option>
            ))}
          </datalist>

          <div className="table-responsive">
            <table className="table table-bordered align-middle">
              <thead>
                <tr>
                  <th style={{ width: 36 }} className="text-center">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={conceptos.length > 0 && conceptosSeleccionados.length === conceptos.length}
                      onChange={toggleTodosConceptos}
                      title="Seleccionar todo"
                    />
                  </th>
                  <th style={{ width: 90 }}>Cant.</th>
                  <th style={{ width: 160 }}>CUnidad</th>
                  <th style={{ width: 130 }}>Unidad</th>
                  <th style={{ width: 140 }}>CProdServ</th>
                  <th>Descripción</th>
                  <th style={{ width: 150 }}>V. Unit</th>
                  <th style={{ width: 150 }}>Importe</th>
                  <th style={{ width: 220 }}>Acción</th>
                </tr>
              </thead>

              <tbody>
                {conceptos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center text-muted">
                      Agrega al menos 1 concepto
                    </td>
                  </tr>
                ) : (
                  conceptos.map((c, idx) => {
                    const editing = editRow === idx;
                    const row = editing ? editDraft : c;
                    const imp = editing
                      ? Number(row?.cantidad || 0) * Number(row?.valorUnitario || 0)
                      : importeConcepto(c);

                    return (
                      <tr key={c._key}>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={conceptosSeleccionados.includes(c._key)}
                            onChange={() => toggleConceptoSeleccionado(c._key)}
                          />
                        </td>

                        <td>
                          {editing ? (
                            <input
                              type="number"
                              className="form-control"
                              value={row.cantidad}
                              min={1}
                              onChange={(e) =>
                                setEditDraft((p) => ({ ...p, cantidad: e.target.value }))
                              }
                            />
                          ) : (
                            c.cantidad
                          )}
                        </td>

                        <td>
                          {editing ? (
                            <SelectClaveUnidad
                              value={row.cUnidad}
                              opciones={clavesUnidad}
                              placeholder="-- Elegir --"
                              onChange={(clave) =>
                                setEditDraft((p) => ({
                                  ...p,
                                  cUnidad: clave,
                                  unidad: unidadDeClave(clavesUnidad, clave, p.unidad),
                                }))
                              }
                            />
                          ) : (
                            c.cUnidad || (
                              <span className="badge text-bg-warning">Falta CUnidad</span>
                            )
                          )}
                        </td>

                        <td>
                          {editing ? (
                            <input
                              className="form-control"
                              value={row.unidad}
                              onChange={(e) =>
                                setEditDraft((p) => ({ ...p, unidad: e.target.value }))
                              }
                            />
                          ) : (
                            c.unidad
                          )}
                        </td>

                        <td>
                          {editing ? (
                            <input
                              className="form-control"
                              list="cprodserv-catalogo"
                              value={row.cProdServ}
                              onChange={(e) =>
                                setEditDraft((p) => ({ ...p, cProdServ: e.target.value }))
                              }
                            />
                          ) : (
                            c.cProdServ || (
                              <span className="badge text-bg-warning">Falta clave SAT</span>
                            )
                          )}
                        </td>

                        <td>
                          {editing ? (
                            <input
                              className="form-control"
                              value={row.descripcion}
                              onChange={(e) =>
                                setEditDraft((p) => ({ ...p, descripcion: e.target.value }))
                              }
                            />
                          ) : (
                            c.descripcion
                          )}
                        </td>

                        <td>
                          {editing ? (
                            <input
                              type="number"
                              className="form-control"
                              value={row.valorUnitario}
                              min={0}
                              onChange={(e) =>
                                setEditDraft((p) => ({ ...p, valorUnitario: e.target.value }))
                              }
                            />
                          ) : (
                            money(c.valorUnitario)
                          )}
                        </td>

                        <td>{money(imp)}</td>

                        <td>
                          {!editing ? (
                            <div className="d-flex gap-2">
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => startEdit(idx)}
                                disabled={editRow !== -1}
                              >
                                Editar
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => delConcepto(idx)}
                                disabled={editRow !== -1}
                              >
                                Eliminar
                              </button>
                            </div>
                          ) : (
                            <div className="d-flex gap-2">
                              <button className="btn btn-sm btn-success" onClick={saveEdit}>
                                Guardar
                              </button>
                              <button className="btn btn-sm btn-secondary" onClick={cancelEdit}>
                                Cancelar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-2">
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={agregarFilaVacia}
              disabled={disabledSteps || editRow !== -1}
            >
              + Agregar fila
            </button>
          </div>
        </div>
      )}

      {/* ======================
          SECCIÓN 3) DETALLE DEL PAGO (complemento de pago)
      ====================== */}
      {esComplementoPago && (
        <div className={`card p-3 mb-3 ${disabledSteps ? "opacity-50" : ""}`}>
          <h5>Detalle del pago</h5>

          {!pasoBaseOk && (
            <div className="alert alert-warning mt-2">
              Busca y agrega al menos una factura para el complemento de pago.
            </div>
          )}

          <div className="table-responsive mt-2">
            <table className="table table-bordered align-middle">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Serie / Folio</th>
                  <th style={{ width: 120 }}>Fecha</th>
                  <th>Cliente</th>
                  <th style={{ width: 90 }}>Parc.</th>
                  <th style={{ width: 150 }}>Saldo anterior</th>
                  <th style={{ width: 170 }}>Importe pagado</th>
                  <th style={{ width: 150 }}>Saldo insoluto</th>
                  <th style={{ width: 110 }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {facturasPago.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted">
                      Agrega al menos 1 factura
                    </td>
                  </tr>
                ) : (
                  facturasPago.map((f) => {
                    const saldoAnt = Number(f.doc.totales?.total || 0);
                    const pagado = Number(f.importePagado || 0);
                    const insoluto = Math.max(saldoAnt - pagado, 0);

                    return (
                      <tr key={f.doc._id}>
                        <td className="fw-bold">
                          {(f.doc.serie || "") + (f.doc.folio || "") || "—"}
                        </td>
                        <td>{fechaCorta(f.doc.fecha)}</td>
                        <td>{f.doc.cliente?.nombre || "—"}</td>
                        <td className="text-center">1</td>
                        <td className="text-end">{money(saldoAnt)}</td>
                        <td>
                          <input
                            type="number"
                            className="form-control text-end"
                            value={f.importePagado}
                            min={0}
                            max={saldoAnt}
                            onChange={(e) => setImportePagado(f.doc._id, e.target.value)}
                          />
                        </td>
                        <td className="text-end">{money(insoluto)}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => quitarFacturaPago(f.doc._id)}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================
          SECCIÓN 4) DATOS DEL COMPROBANTE
      ====================== */}
      {tipoFactura && (
        <div className={`card p-3 mb-3 ${disabledSteps ? "opacity-50" : ""}`}>
          <h5>Datos del comprobante</h5>
          <div className="text-muted small mb-2">
            Tipo de comprobante: <b>{tipoInfo?.tipoComprobante}</b> — {tipoInfo?.label}
          </div>

          <div className="row g-3">
            {/* Complemento de pago: fecha de pago + forma de pago */}
            {esComplementoPago ? (
              <>
                <div className="col-12 col-md-3">
                  <label className="form-label">Fecha de pago</label>
                  <input
                    type="date"
                    className="form-control"
                    value={fechaPago}
                    disabled={disabledSteps}
                    onChange={(e) => setFechaPago(e.target.value)}
                  />
                </div>

                <div className="col-12 col-md-5">
                  <label className="form-label">Forma de pago</label>
                  <Dropdown
                    className="form-select"
                    value={formaPago}
                    disabled={disabledSteps}
                    onChange={(e) => setFormaPago(e.target.value)}
                  >
                    {FORMA_PAGO.map((x) => (
                      <Dropdown.Option key={x.value} value={x.value}>
                        {x.label}
                      </Dropdown.Option>
                    ))}
                  </Dropdown>
                </div>

                <div className="col-12 col-md-2">
                  <label className="form-label">Uso CFDI</label>
                  <input className="form-control" value="CP01 - Pagos" disabled readOnly />
                </div>

                <div className="col-12 col-md-2">
                  <label className="form-label">Moneda</label>
                  <input className="form-control" value="MXN" disabled readOnly />
                </div>

                <div className="col-12">
                  <label className="form-label">Información extra / comentarios</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={comentarios}
                    disabled={disabledSteps}
                    onChange={(e) => setComentarios(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="col-12 col-md-5">
                  <label className="form-label">Uso CFDI</label>
                  <Dropdown
                    className="form-select"
                    value={usoCfdi}
                    disabled={disabledSteps}
                    onChange={(e) => setUsoCfdi(e.target.value)}
                  >
                    {USO_CFDI.map((x) => (
                      <Dropdown.Option key={x.value} value={x.value}>
                        {x.label}
                      </Dropdown.Option>
                    ))}
                  </Dropdown>
                </div>

                <div className="col-12 col-md-2">
                  <label className="form-label">IVA</label>
                  <Dropdown
                    className="form-select"
                    value={ivaRate}
                    disabled={disabledSteps}
                    onChange={(e) => setIvaRate(Number(e.target.value))}
                  >
                    {IVA_OPTS.map((x) => (
                      <Dropdown.Option key={String(x.value)} value={x.value}>
                        {x.label}
                      </Dropdown.Option>
                    ))}
                  </Dropdown>
                </div>

                <div className="col-12 col-md-2">
                  <label className="form-label">Moneda</label>
                  <Dropdown
                    className="form-select"
                    value={moneda}
                    disabled={disabledSteps}
                    onChange={(e) => setMoneda(e.target.value)}
                  >
                    <Dropdown.Option value="MXN">MXN</Dropdown.Option>
                    <Dropdown.Option value="USD">USD</Dropdown.Option>
                  </Dropdown>
                </div>

                <div className="col-12 col-md-3">
                  <label className="form-label">Tipo de cambio (si USD)</label>
                  <input
                    className="form-control"
                    value={tipoCambio}
                    disabled
                    readOnly
                    placeholder="Ej. 17.23"
                    title="Se toma del tipo de cambio definido en Configuración"
                  />
                  {moneda === "USD" && !cargandoTipoCambio && !tipoCambioConfig && (
                    <small className="text-danger">
                      No hay un tipo de cambio configurado. Regístralo en Configuración.
                    </small>
                  )}
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Método de pago</label>
                  <Dropdown
                    className="form-select"
                    value={metodoPago}
                    disabled={disabledSteps}
                    onChange={(e) => setMetodoPago(e.target.value)}
                  >
                    {METODO_PAGO.map((x) => (
                      <Dropdown.Option key={x.value} value={x.value}>
                        {x.label}
                      </Dropdown.Option>
                    ))}
                  </Dropdown>
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Forma de pago</label>
                  <Dropdown
                    className="form-select"
                    value={formaPago}
                    disabled={disabledSteps}
                    onChange={(e) => setFormaPago(e.target.value)}
                  >
                    {FORMA_PAGO.map((x) => (
                      <Dropdown.Option key={x.value} value={x.value}>
                        {x.label}
                      </Dropdown.Option>
                    ))}
                  </Dropdown>
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Orden de compra</label>
                  <input
                    className="form-control"
                    value={oc}
                    disabled={disabledSteps}
                    onChange={(e) => setOc(e.target.value)}
                  />
                </div>

                {esNotaCredito && facturasNC.length > 0 && (
                  <div className="col-12 col-md-6">
                    <label className="form-label">
                      Facturas relacionadas (Relación 01)
                    </label>
                    <input
                      className="form-control"
                      value={`${facturasNC
                        .map((f) => (f.serie || "") + (f.folio || ""))
                        .join(", ")} · ${money(totalNC)}`}
                      disabled
                      readOnly
                    />
                  </div>
                )}

                <div className="col-12">
                  <label className="form-label">Información extra / comentarios</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={comentarios}
                    disabled={disabledSteps}
                    onChange={(e) => setComentarios(e.target.value)}
                  />
                </div>

                {esFactura && (
                  <div className="col-12">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={aplicarRetencionIsr}
                        disabled={disabledSteps}
                        onChange={(e) => setAplicarRetencionIsr(e.target.checked)}
                        id="isr"
                      />
                      <label className="form-check-label" htmlFor="isr">
                        Aplicar retención ISR 1.25%
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ======================
          TOTALES + ACCIONES
      ====================== */}
      {tipoFactura && (
        <div className="card p-3 mb-4">
          <div className="d-flex justify-content-end">
            <div style={{ minWidth: 360 }}>
              {esComplementoPago ? (
                <>
                  <div className="d-flex justify-content-between">
                    <b>SALDO ANTERIOR</b>
                    <span>{money(saldoTotalPago)}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <b>SALDO INSOLUTO</b>
                    <span>{money(Math.max(saldoTotalPago - montoPago, 0))}</span>
                  </div>
                  <hr />
                  <div className="d-flex justify-content-between fs-5">
                    <b>IMPORTE DEL PAGO</b>
                    <b>{money(montoPago)}</b>
                  </div>
                </>
              ) : (
                <>
                  <div className="d-flex justify-content-between">
                    <b>SUBTOTAL</b>
                    <span>{money(subtotal)}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <b>IVA</b>
                    <span>{money(iva)}</span>
                  </div>

                  {aplicarRetencionIsr && esFactura && (
                    <div className="d-flex justify-content-between">
                      <b>Retención ISR 1.25%</b>
                      <span>- {money(isr)}</span>
                    </div>
                  )}

                  <hr />
                  <div className="d-flex justify-content-between fs-5">
                    <b>TOTAL</b>
                    <b>{money(total)}</b>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 d-flex gap-2 justify-content-end">
            <button
              className="btn btn-outline-secondary"
              onClick={onPreviewPDF}
              disabled={!puedePreview || pdfLoading}
            >
              {pdfLoading ? "Generando PDF..." : "Vista previa PDF"}
            </button>

            <button
              className="btn btn-primary"
              onClick={onGenerarXML}
              disabled={!puedePreview || xmlLoading}
            >
              {xmlLoading ? "Generando XML..." : "Generar XML"}
            </button>
          </div>

          {/* Debug (opcional) */}
          {(cadenaOriginal || sello) && (
            <div className="mt-3">
              <div className="alert alert-info mb-2">
                ✅ XML generado. (Abajo te dejo cadena/sello para debug si lo necesitas)
              </div>
              {cadenaOriginal && (
                <div className="mb-2">
                  <b>Cadena Original:</b>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 6 }}>
                    {cadenaOriginal}
                  </pre>
                </div>
              )}
              {sello && (
                <div className="mb-2">
                  <b>Sello (base64):</b>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 6 }}>
                    {sello}
                  </pre>
                </div>
              )}
              {xmlSigned && (
                <div>
                  <b>XML firmado:</b>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 6, maxHeight: 240, overflow: "auto" }}>
                    {xmlSigned}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {pdfModal}
    </div>
  );
}
