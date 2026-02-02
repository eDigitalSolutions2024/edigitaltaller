import { useMemo, useState } from "react";
import axios from "axios";

const fmx = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const hoyYMD = () => new Date().toISOString().slice(0, 10);

const nuevaFila = () => ({
  cantidad: 1,
  unidad: "Pieza",
  codigoInterno: "",
  codigoProveedor: "",
  marca: "",
  precioUnitario: 0,
  ivaPct: 16,
  ordenServicio: "",
  notas: "",
  maxDevolver: undefined,
  itemId: null, // clave oculta para inventario (opcional)
});

// En tu .env: REACT_APP_API_URL=http://localhost:4000/api
const API = process.env.REACT_APP_API_URL || "";
const url = (p) => `${API}${p.startsWith("/") ? "" : "/"}${p}`;

export default function DevDinero() {
  const [started, setStarted] = useState(false);
  const [sending, setSending] = useState(false);
  const [prep, setPrep] = useState(null);

  // Encabezado (Step 1 + se reutiliza en Step 2)
  const [head, setHead] = useState({
    fechaDevolucion: hoyYMD(),
    facturaNumero: "",
    motivo: "",
    proveedor: "",
    fechaRecibe: hoyYMD(),
    quienRecibe: "",
    formaPago: "Efectivo",
    observaciones: "",
  });

  const onHead = (e) => setHead((h) => ({ ...h, [e.target.name]: e.target.value }));

  // Filas
  const [rows, setRows] = useState([nuevaFila()]);
  const onRow = (i, k, v) =>
    setRows((rs) => {
      const c = [...rs];
      const cur = { ...c[i] };
      let val = v;

      if (k === "cantidad") {
        const n = Number(v || 0);
        const max = Number(cur.maxDevolver ?? Infinity);
        val = Math.max(0, Math.min(n, max));
      }
      c[i] = { ...cur, [k]: val };
      return c;
    });

  const addRow = () => setRows((rs) => [...rs, nuevaFila()]);
  const delRow = (i) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  const calcRow = (r) => {
    const cant = Number(r.cantidad || 0);
    const pu = Number(r.precioUnitario || 0);
    const ivaP = Number(r.ivaPct || 0);
    const subtotal = cant * pu;
    const iva = subtotal * (ivaP / 100);
    const total = subtotal + iva;
    return { subtotal, iva, total };
  };

  const totales = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          const { subtotal, iva, total } = calcRow(r);
          acc.subtotal += subtotal;
          acc.iva += iva;
          acc.total += total;
          return acc;
        },
        { subtotal: 0, iva: 0, total: 0 }
      ),
    [rows]
  );

  const step1Valid = head.fechaDevolucion && head.facturaNumero && head.motivo;

  // === Traer partidas de la factura (prep) ===
  const beginWithFactura = async () => {
    try {
      const { data } = await axios.get(
        url("/devoluciones/proveedor/dinero/prep"),
        { params: { factura: head.facturaNumero } }
      );

      // Set proveedor por nombre (si viene)
      setHead((h) => ({ ...h, proveedor: data?.proveedor?.nombre || h.proveedor }));

      // Mapear filas "bonitas" para la tabla
      const filas =
        (data?.items || []).map((it) => ({
            cantidad: 0,
            maxDevolver: Number(it.maxDevolver),
            unidad: it.unidad || "Pieza",
            codigoInterno: it.codigoInterno || "",     // humano
            codigoProveedor: it.codigoProveedor || "",
            marca: it.marca || "",
            precioUnitario: Number(it.pu ?? 0),
            ivaPct: Number(it.iva ?? 0),
            ordenServicio: "",
            notas: "",
            itemId: it.keyInventario || null,          // clave oculta (opcional)
          })) || [];

      setRows(filas.length ? filas : [nuevaFila()]);
      setPrep(data);
      setStarted(true);
    } catch (err) {
      console.error("prep error:", err?.response || err);
      alert(err?.response?.data?.error || `No se pudo cargar la factura (HTTP ${err?.response?.status || "??"})`);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const filas = rows.filter((r) => Number(r.cantidad) > 0);
      if (!filas.length) {
        alert("Indica al menos una cantidad a devolver.");
        setSending(false);
        return;
      }

      const payload = {
        ...head,
        lineas: filas.map((r) => ({
          cantidad: Number(r.cantidad || 0),
          unidad: r.unidad,
          codigoInterno: r.codigoInterno,         // humano
          itemId: r.itemId || undefined,          // opcional
          codigoProveedor: r.codigoProveedor,
          marca: r.marca,
          precioUnitario: Number(r.precioUnitario || 0),
          ivaPct: Number(r.ivaPct || 0),
          ordenServicio: r.ordenServicio,
          notas: r.notas,
        })),
      };

      const { data } = await axios.post(url("/devoluciones/dinero"), payload);

      // El backend devuelve { ok, folio, total, devId, dev }
      const folio = data?.folio || data?.dev?.folio || "—";
      const total = data?.total ?? data?.dev?.totales?.total ?? 0;

      alert(`Devolución registrada\nFolio: ${folio}\nTotal: ${fmx.format(total)}`);

      // Reset
      setRows([nuevaFila()]);
      setHead((h) => ({ ...h, motivo: "", observaciones: "" }));
      setPrep(null);
      setStarted(false);
    } catch (err) {
      console.error("submit error:", err?.response || err);
      alert(err?.response?.data?.msg || err?.response?.data?.error || `Error al registrar (HTTP ${err?.response?.status || "??"})`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container-fluid py-3">
      <h1 className="display-6 mb-3">DEVOLUCIONES DE MATERIAL — DINERO</h1>

      {/* ===== Paso 1: pequeño formulario ===== */}
      {!started && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-sm-4">
                <label className="form-label">Fecha Devolución</label>
                <input
                  type="date"
                  name="fechaDevolucion"
                  value={head.fechaDevolucion}
                  onChange={onHead}
                  className="form-control"
                />
              </div>

              <div className="col-sm-4">
                <label className="form-label">Número de Factura</label>
                <input
                  type="text"
                  name="facturaNumero"
                  value={head.facturaNumero}
                  onChange={onHead}
                  className="form-control"
                  placeholder="Ej. F-12345"
                />
              </div>

              <div className="col-sm-8">
                <label className="form-label">Motivo</label>
                <input
                  type="text"
                  name="motivo"
                  value={head.motivo}
                  onChange={onHead}
                  className="form-control"
                  placeholder="Describe brevemente el motivo"
                />
              </div>
            </div>

            <div className="mt-4 d-flex gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!step1Valid}
                onClick={beginWithFactura}
              >
                Comenzar captura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Paso 2: detalles + tabla ===== */}
      {started && (
        <>
          {/* Datos adicionales */}
          <div className="card shadow-sm mb-4">
            <div className="card-header">Datos de Devolución</div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label">Proveedor</label>
                  <input
                    type="text"
                    name="proveedor"
                    value={head.proveedor}
                    onChange={onHead}
                    className="form-control"
                    placeholder="Nombre o código"
                    readOnly={!!prep}
                  />
                </div>

                <div className="col-sm-4">
                  <label className="form-label">Fecha Recibe</label>
                  <input
                    type="date"
                    name="fechaRecibe"
                    value={head.fechaRecibe}
                    onChange={onHead}
                    className="form-control"
                  />
                </div>

                <div className="col-sm-4">
                  <label className="form-label">Quién lo recibe</label>
                  <input
                    type="text"
                    name="quienRecibe"
                    value={head.quienRecibe}
                    onChange={onHead}
                    className="form-control"
                  />
                </div>

                <div className="col-sm-4">
                  <label className="form-label">Forma en que se reembolsa</label>
                  <select
                    name="formaPago"
                    value={head.formaPago}
                    onChange={onHead}
                    className="form-select"
                  >
                    <option>Efectivo</option>
                    <option>Tarjeta</option>
                    <option>Transferencia</option>
                  </select>
                </div>

                <div className="col-md-8">
                  <label className="form-label">Observaciones</label>
                  <input
                    type="text"
                    name="observaciones"
                    value={head.observaciones}
                    onChange={onHead}
                    className="form-control"
                    placeholder="Notas internas"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de piezas devueltas */}
          <div className="card shadow-sm mb-4">
            <div className="card-header">Pieza Devuelta</div>
            <div className="card-body">
              <div className="table-responsive">
                <table className="table table-bordered align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ minWidth: 80 }}>Cant</th>
                      <th style={{ minWidth: 120 }}>Unidad</th>
                      <th style={{ minWidth: 160 }}>Numero de Factura</th>
                      <th style={{ minWidth: 160 }}>Código Proveedor</th>
                      <th style={{ minWidth: 120 }}>Marca</th>
                      <th style={{ minWidth: 110 }}>PU</th>
                      <th style={{ minWidth: 90 }}>IVA %</th>
                      <th style={{ minWidth: 120 }}>Subtotal</th>
                      <th style={{ minWidth: 120 }}>IVA</th>
                      <th style={{ minWidth: 120 }}>Total</th>
                      <th style={{ minWidth: 130 }}>Orden Serv.</th>
                      <th style={{ minWidth: 90 }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const { subtotal, iva, total } = calcRow(r);
                      return (
                        <tr key={i}>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              max={r.maxDevolver ?? undefined}
                              value={r.cantidad}
                              onChange={(e) => onRow(i, "cantidad", e.target.value)}
                              className="form-control form-control-sm"
                              title={r.maxDevolver != null ? `Máx: ${r.maxDevolver}` : undefined}
                            />
                          </td>
                          <td>
                            <input
                              value={r.unidad}
                              onChange={(e) => onRow(i, "unidad", e.target.value)}
                              className="form-control form-control-sm"
                              readOnly={!!prep}
                            />
                          </td>
                          <td>
                          {/* Muestra el número de factura */}
                          <input
                            value={head.facturaNumero || ''}
                            className="form-control form-control-sm"
                            readOnly
                          />
                          {/* Conserva el código real para enviar/validar en backend */}
                          <input type="hidden" value={r.codigoInterno} />
                        </td>
                          <td>
                            <input
                              value={r.codigoProveedor}
                              onChange={(e) => onRow(i, "codigoProveedor", e.target.value)}
                              className="form-control form-control-sm"
                              readOnly={!!prep}
                            />
                          </td>
                          <td>
                            <input
                              value={r.marca}
                              onChange={(e) => onRow(i, "marca", e.target.value)}
                              className="form-control form-control-sm"
                              readOnly={!!prep}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              value={r.precioUnitario}
                              onChange={(e) => onRow(i, "precioUnitario", e.target.value)}
                              className="form-control form-control-sm"
                              readOnly={!!prep}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              value={r.ivaPct}
                              onChange={(e) => onRow(i, "ivaPct", e.target.value)}
                              className="form-control form-control-sm"
                              readOnly={!!prep}
                            />
                          </td>
                          <td className="text-end">{fmx.format(subtotal)}</td>
                          <td className="text-end">{fmx.format(iva)}</td>
                          <td className="text-end">{fmx.format(total)}</td>
                          <td>
                            <input
                              value={r.ordenServicio}
                              onChange={(e) => onRow(i, "ordenServicio", e.target.value)}
                              className="form-control form-control-sm"
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => delRow(i)}
                              disabled={!!prep && rows.length <= 1}
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="table-light">
                    <tr>
                      <th colSpan={7}>Totales</th>
                      <th className="text-end">{fmx.format(totales.subtotal)}</th>
                      <th className="text-end">{fmx.format(totales.iva)}</th>
                      <th className="text-end">{fmx.format(totales.total)}</th>
                      <th colSpan={2}></th>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="d-flex gap-2">
                <button type="button" onClick={addRow} className="btn btn-secondary" disabled={!!prep}>
                  Agregar renglón
                </button>
                <button
                  type="button"
                  className="btn btn-outline-dark"
                  onClick={() => setStarted(false)}
                >
                  Volver
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={sending}
                  onClick={onSubmit}
                >
                  {sending ? "Guardando…" : "Registrar Devolución"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
