import { useRef, useState } from "react";
import {
  searchFacturasDevolucion,
  prefillDevolucionRefaccion,
  createDevolucionRefaccion,
  openDevolucionRefaccionPdf,
} from "../../../api/devoluciones";

const hoyYMD = () => new Date().toISOString().slice(0, 10);
const toYMD = (v) => (v ? String(v).slice(0, 10) : "");

const TIPOS = [
  { value: "DINERO", label: "Dinero (Pesos, Dólares o Cheque)" },
  { value: "PIEZA", label: "Pieza x Pieza" },
  { value: "VALE", label: "Vale" },
];

const CANT_INICIAL = { pesos: "", dolares: "", cheque: "", vale: "", garantia: "" };

const headInicial = () => ({
  tipoDevolucion: "DINERO",
  proveedor: "",
  fechaFactura: "",
  fechaDevolucion: hoyYMD(),
  numeroFactura: "",
  numeroComprobante: "",
  numeroOrdenServicio: "",
});

export default function DevolucionRefaccion() {
  const [head, setHead] = useState(headInicial());
  const [refacciones, setRefacciones] = useState([{ codigo: "", nombre: "" }]);
  const [cantidad, setCantidad] = useState({ ...CANT_INICIAL });
  const [destino, setDestino] = useState({
    cajaChicaDlls: false,
    cajaChicaMN: false,
    banco: false,
    credito: false,
  });
  const [motivo, setMotivo] = useState({
    errorTecnico: false,
    errorRefaccionario: false,
    errorProveedor: false,
    core: false,
    piezaDefectuosa: false,
    cancelacionVenta: false,
    otro: "",
  });

  const [buscando, setBuscando] = useState(false);
  const [sending, setSending] = useState(false);

  // Typeahead de No. de factura (igual que el campo Serie de Nueva Orden)
  const [sugerenciasFactura, setSugerenciasFactura] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const facturaDebounceRef = useRef(null);

  const onHead = (e) => setHead((h) => ({ ...h, [e.target.name]: e.target.value }));
  const onCantidad = (e) => setCantidad((c) => ({ ...c, [e.target.name]: e.target.value }));
  const onDestino = (e) => setDestino((d) => ({ ...d, [e.target.name]: e.target.checked }));
  const onMotivo = (e) => setMotivo((m) => ({ ...m, [e.target.name]: e.target.checked }));

  // Habilita solo los campos de "cantidad a recuperar" del tipo elegido
  const cantHabilitada = (campo) => {
    if (head.tipoDevolucion === "DINERO") return ["pesos", "dolares", "cheque"].includes(campo);
    if (head.tipoDevolucion === "VALE") return campo === "vale";
    return campo === "garantia"; // PIEZA
  };

  const onTipo = (e) => {
    const tipo = e.target.value;
    setHead((h) => ({ ...h, tipoDevolucion: tipo }));
    // Limpia los campos que ya no aplican para no imprimirlos por error
    setCantidad((c) => {
      const n = { ...c };
      Object.keys(n).forEach((k) => {
        const aplica =
          tipo === "DINERO" ? ["pesos", "dolares", "cheque"].includes(k)
          : tipo === "VALE" ? k === "vale"
          : k === "garantia";
        if (!aplica) n[k] = "";
      });
      return n;
    });
  };

  const onRefaccion = (i, k, v) =>
    setRefacciones((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRefaccion = () => setRefacciones((rs) => [...rs, { codigo: "", nombre: "" }]);
  const delRefaccion = (i) =>
    setRefacciones((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  // No. de factura: busca en Entrada Inventario mientras se escribe
  const onNumeroFactura = (e) => {
    const valor = e.target.value;
    setHead((h) => ({ ...h, numeroFactura: valor }));

    if (facturaDebounceRef.current) clearTimeout(facturaDebounceRef.current);
    if (valor.trim().length < 1) {
      setSugerenciasFactura([]);
      setMostrarSugerencias(false);
      return;
    }
    setBuscando(true);
    facturaDebounceRef.current = setTimeout(async () => {
      try {
        const { data } = await searchFacturasDevolucion(valor.trim());
        setSugerenciasFactura(Array.isArray(data) ? data : []);
        setMostrarSugerencias(true);
      } catch {
        setSugerenciasFactura([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
  };

  // Al elegir una sugerencia se prellenan los datos de la factura
  const seleccionarFactura = async (f) => {
    setSugerenciasFactura([]);
    setMostrarSugerencias(false);
    setHead((h) => ({ ...h, numeroFactura: f.numero }));
    try {
      const { data } = await prefillDevolucionRefaccion(f.numero);
      setHead((h) => ({
        ...h,
        proveedor: data.proveedor || h.proveedor,
        fechaFactura: toYMD(data.fechaFactura) || h.fechaFactura,
        numeroFactura: data.numeroFactura || h.numeroFactura,
        numeroOrdenServicio: data.numeroOrdenServicio || h.numeroOrdenServicio,
      }));
      if (Array.isArray(data.refacciones) && data.refacciones.length) {
        setRefacciones(data.refacciones);
      }
    } catch (err) {
      console.error("prefill error:", err?.response || err);
      alert(err?.response?.data?.error || "No se pudieron cargar los datos de la factura. Puedes llenarlos manualmente.");
    }
  };

  const limpiar = () => {
    setHead(headInicial());
    setRefacciones([{ codigo: "", nombre: "" }]);
    setCantidad({ ...CANT_INICIAL });
    setDestino({ cajaChicaDlls: false, cajaChicaMN: false, banco: false, credito: false });
    setMotivo({
      errorTecnico: false,
      errorRefaccionario: false,
      errorProveedor: false,
      core: false,
      piezaDefectuosa: false,
      cancelacionVenta: false,
      otro: "",
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!head.proveedor.trim()) {
      alert("Indica el proveedor.");
      return;
    }
    if (!head.fechaDevolucion) {
      alert("Indica la fecha de la devolución.");
      return;
    }
    setSending(true);
    try {
      const payload = {
        ...head,
        refacciones: refacciones.filter((r) => r.codigo.trim() || r.nombre.trim()),
        cantidadRecuperar: cantidad,
        destinoDevolucion: destino,
        motivoDevolucion: motivo,
      };
      const { data } = await createDevolucionRefaccion(payload);
      openDevolucionRefaccionPdf(data.devId);
      limpiar();
    } catch (err) {
      console.error("submit error:", err?.response || err);
      alert(err?.response?.data?.error || `Error al registrar (HTTP ${err?.response?.status || "??"})`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container-fluid py-3">
      <h1 className="display-6 mb-3">DEVOLUCIÓN DE REFACCIONES</h1>

      <form onSubmit={onSubmit}>
        {/* ===== Datos generales ===== */}
        <div className="card shadow-sm mb-4">
          <div className="card-header">Datos de la Devolución</div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-sm-4">
                <label className="form-label">Devolución por</label>
                <select
                  className="form-select"
                  name="tipoDevolucion"
                  value={head.tipoDevolucion}
                  onChange={onTipo}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="col-sm-4 position-relative">
                <label className="form-label">No. de factura</label>
                <input
                  type="text"
                  className="form-control"
                  name="numeroFactura"
                  value={head.numeroFactura}
                  onChange={onNumeroFactura}
                  onFocus={() => sugerenciasFactura.length > 0 && setMostrarSugerencias(true)}
                  onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                  autoComplete="off"
                  placeholder="Ej. GRF26197058"
                />
                {buscando && <div className="form-text">Buscando…</div>}
                {mostrarSugerencias && sugerenciasFactura.length > 0 && (
                  <div className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 20 }}>
                    {sugerenciasFactura.map((f) => (
                      <button
                        type="button"
                        key={f._id}
                        className="list-group-item list-group-item-action py-1 px-2 small"
                        onMouseDown={() => seleccionarFactura(f)}
                      >
                        <strong>{f.numero}</strong>
                        {f.proveedor ? ` — ${f.proveedor}` : ""}
                        {f.fechaFactura ? ` · ${toYMD(f.fechaFactura)}` : ""}
                      </button>
                    ))}
                  </div>
                )}
                <div className="form-text">
                  Si la factura está en Entrada Inventario se rellenan algunos datos.
                </div>
              </div>

              <div className="col-sm-4">
                <label className="form-label">Proveedor</label>
                <input
                  type="text"
                  className="form-control"
                  name="proveedor"
                  value={head.proveedor}
                  onChange={onHead}
                />
              </div>

              <div className="col-sm-3">
                <label className="form-label">Fecha de la factura (compra)</label>
                <input
                  type="date"
                  className="form-control"
                  name="fechaFactura"
                  value={head.fechaFactura}
                  onChange={onHead}
                />
              </div>

              <div className="col-sm-3">
                <label className="form-label">Fecha de la devolución</label>
                <input
                  type="date"
                  className="form-control"
                  name="fechaDevolucion"
                  value={head.fechaDevolucion}
                  onChange={onHead}
                />
              </div>

              <div className="col-sm-3">
                <label className="form-label">No. de comprobante de devolución</label>
                <input
                  type="text"
                  className="form-control"
                  name="numeroComprobante"
                  value={head.numeroComprobante}
                  onChange={onHead}
                />
              </div>

              <div className="col-sm-3">
                <label className="form-label">No. de Orden de Servicio</label>
                <input
                  type="text"
                  className="form-control"
                  name="numeroOrdenServicio"
                  value={head.numeroOrdenServicio}
                  onChange={onHead}
                  placeholder="Ej. P-7770"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== Refacciones ===== */}
        <div className="card shadow-sm mb-4">
          <div className="card-header">Refacciones (código y nombre)</div>
          <div className="card-body">
            {refacciones.map((r, i) => (
              <div className="row g-2 mb-2" key={i}>
                <div className="col-sm-4">
                  <input
                    className="form-control"
                    placeholder="Código"
                    value={r.codigo}
                    onChange={(e) => onRefaccion(i, "codigo", e.target.value)}
                  />
                </div>
                <div className="col-sm-6">
                  <input
                    className="form-control"
                    placeholder="Nombre"
                    value={r.nombre}
                    onChange={(e) => onRefaccion(i, "nombre", e.target.value)}
                  />
                </div>
                <div className="col-sm-2">
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => delRefaccion(i)}
                    disabled={refacciones.length <= 1}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={addRefaccion}>
              Agregar refacción
            </button>
          </div>
        </div>

        {/* ===== Cantidad a recuperar ===== */}
        <div className="card shadow-sm mb-4">
          <div className="card-header">Cantidad a recuperar</div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-sm-2">
                <label className="form-label">Pesos</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  name="pesos"
                  value={cantidad.pesos}
                  onChange={onCantidad}
                  disabled={!cantHabilitada("pesos")}
                />
              </div>
              <div className="col-sm-2">
                <label className="form-label">Dólares</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  name="dolares"
                  value={cantidad.dolares}
                  onChange={onCantidad}
                  disabled={!cantHabilitada("dolares")}
                />
              </div>
              <div className="col-sm-2">
                <label className="form-label">Cheque</label>
                <input
                  type="text"
                  className="form-control"
                  name="cheque"
                  value={cantidad.cheque}
                  onChange={onCantidad}
                  disabled={!cantHabilitada("cheque")}
                />
              </div>
              <div className="col-sm-3">
                <label className="form-label">Vale (ver anexo)</label>
                <input
                  type="text"
                  className="form-control"
                  name="vale"
                  value={cantidad.vale}
                  onChange={onCantidad}
                  disabled={!cantHabilitada("vale")}
                />
              </div>
              <div className="col-sm-3">
                <label className="form-label">Garantía (pieza x pieza)</label>
                <input
                  type="text"
                  className="form-control"
                  name="garantia"
                  value={cantidad.garantia}
                  onChange={onCantidad}
                  disabled={!cantHabilitada("garantia")}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== Destino y motivo ===== */}
        <div className="row g-4 mb-4">
          <div className="col-lg-5">
            <div className="card shadow-sm h-100">
              <div className="card-header">Destino de la devolución</div>
              <div className="card-body">
                {[
                  ["cajaChicaDlls", "Caja Chica Dlls"],
                  ["cajaChicaMN", "Caja Chica MN"],
                  ["banco", "Banco"],
                  ["credito", "Crédito"],
                ].map(([k, label]) => (
                  <div className="form-check" key={k}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`dest-${k}`}
                      name={k}
                      checked={destino[k]}
                      onChange={onDestino}
                    />
                    <label className="form-check-label" htmlFor={`dest-${k}`}>{label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-lg-7">
            <div className="card shadow-sm h-100">
              <div className="card-header">Motivo de la devolución</div>
              <div className="card-body">
                <div className="row">
                  {[
                    ["errorTecnico", "Error técnico"],
                    ["errorRefaccionario", "Error refaccionario"],
                    ["errorProveedor", "Error Proveedor"],
                    ["core", "Core"],
                    ["piezaDefectuosa", "Pieza defectuosa"],
                    ["cancelacionVenta", "Cancelación venta"],
                  ].map(([k, label]) => (
                    <div className="col-sm-6" key={k}>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`mot-${k}`}
                          name={k}
                          checked={motivo[k]}
                          onChange={onMotivo}
                        />
                        <label className="form-check-label" htmlFor={`mot-${k}`}>{label}</label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <label className="form-label">Otro</label>
                  <input
                    type="text"
                    className="form-control"
                    value={motivo.otro}
                    onChange={(e) => setMotivo((m) => ({ ...m, otro: e.target.value }))}
                    placeholder="Especifica otro motivo"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="d-flex gap-2 mb-4">
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? "Guardando…" : "Guardar y generar PDF"}
          </button>
          <button type="button" className="btn btn-outline-dark" onClick={limpiar}>
            Limpiar
          </button>
        </div>
      </form>
    </div>
  );
}
