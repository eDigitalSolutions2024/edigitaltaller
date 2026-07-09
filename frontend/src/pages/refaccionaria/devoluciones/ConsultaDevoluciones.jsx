import { useEffect, useRef, useState } from "react";
import {
  getDevolucionesRefaccion,
  openDevolucionRefaccionPdf,
} from "../../../api/devoluciones";

const toYMD = (v) => (v ? String(v).slice(0, 10) : "");

const TIPO_LABEL = {
  DINERO: "Dinero",
  PIEZA: "Pieza x Pieza",
  VALE: "Vale",
};

// Resume la cantidad a recuperar mostrando solo lo que se llenó
const resumenCantidad = (c = {}) => {
  const partes = [];
  if (c.pesos) partes.push(`Pesos: $${c.pesos}`);
  if (c.dolares) partes.push(`Dlls: $${c.dolares}`);
  if (c.cheque) partes.push(`Cheque: ${c.cheque}`);
  if (c.vale) partes.push(`Vale: ${c.vale}`);
  if (c.garantia) partes.push(`Garantía: ${c.garantia}`);
  return partes.join(" · ");
};

const resumenRefacciones = (refs = []) =>
  refs
    .map((r) => [r.codigo, r.nombre].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");

export default function ConsultaDevoluciones() {
  const [filtros, setFiltros] = useState({ q: "", tipo: "", desde: "", hasta: "" });
  const [devoluciones, setDevoluciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const debounceRef = useRef(null);

  const buscar = async (f) => {
    setCargando(true);
    try {
      const params = {};
      if (f.q.trim()) params.q = f.q.trim();
      if (f.tipo) params.tipo = f.tipo;
      if (f.desde) params.desde = f.desde;
      if (f.hasta) params.hasta = f.hasta;
      const { data } = await getDevolucionesRefaccion(params);
      setDevoluciones(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("consulta error:", err?.response || err);
      setDevoluciones([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    buscar(filtros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFiltro = (e) => {
    const { name, value } = e.target;
    const nuevos = { ...filtros, [name]: value };
    setFiltros(nuevos);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    // El texto se busca con debounce; tipo y fechas de inmediato
    if (name === "q") {
      debounceRef.current = setTimeout(() => buscar(nuevos), 400);
    } else {
      buscar(nuevos);
    }
  };

  const limpiarFiltros = () => {
    const vacios = { q: "", tipo: "", desde: "", hasta: "" };
    setFiltros(vacios);
    buscar(vacios);
  };

  return (
    <div className="container-fluid py-3">
      <h1 className="display-6 mb-3">CONSULTA DE DEVOLUCIONES</h1>

      {/* ===== Filtros ===== */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Buscar</label>
              <input
                type="text"
                className="form-control"
                name="q"
                value={filtros.q}
                onChange={onFiltro}
                placeholder="Folio, proveedor, factura, comprobante, orden o refacción"
                autoComplete="off"
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Devolución por</label>
              <select
                className="form-select"
                name="tipo"
                value={filtros.tipo}
                onChange={onFiltro}
              >
                <option value="">Todas</option>
                <option value="DINERO">Dinero</option>
                <option value="PIEZA">Pieza x Pieza</option>
                <option value="VALE">Vale</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Desde</label>
              <input
                type="date"
                className="form-control"
                name="desde"
                value={filtros.desde}
                onChange={onFiltro}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label">Hasta</label>
              <input
                type="date"
                className="form-control"
                name="hasta"
                value={filtros.hasta}
                onChange={onFiltro}
              />
            </div>
            <div className="col-md-1 d-flex align-items-end">
              <button type="button" className="btn btn-outline-dark w-100" onClick={limpiarFiltros}>
                Limpiar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Resultados ===== */}
      <div className="card shadow-sm">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span>Devoluciones</span>
          <span className="text-muted small">
            {cargando ? "Buscando…" : `${devoluciones.length} resultado(s)`}
          </span>
        </div>
        <div className="card-body">
          {devoluciones.length === 0 && !cargando ? (
            <p className="text-muted mb-0">No hay devoluciones con esos filtros.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-hover align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Folio</th>
                    <th>Fecha devolución</th>
                    <th>Devolución por</th>
                    <th>Proveedor</th>
                    <th>Factura</th>
                    <th>Comprobante</th>
                    <th>Orden Serv.</th>
                    <th>Refacciones</th>
                    <th>Cantidad a recuperar</th>
                    <th>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {devoluciones.map((d) => (
                    <tr key={d._id}>
                      <td>{d.folio}</td>
                      <td>{toYMD(d.fechaDevolucion)}</td>
                      <td>{TIPO_LABEL[d.tipoDevolucion] || d.tipoDevolucion}</td>
                      <td>{d.proveedor}</td>
                      <td>{d.numeroFactura}</td>
                      <td>{d.numeroComprobante}</td>
                      <td>{d.numeroOrdenServicio}</td>
                      <td className="small">{resumenRefacciones(d.refacciones)}</td>
                      <td className="small">{resumenCantidad(d.cantidadRecuperar)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => openDevolucionRefaccionPdf(d._id)}
                        >
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
