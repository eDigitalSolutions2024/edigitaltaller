import { useEffect, useMemo, useState } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

export default function SalidaInventario() {
  const [fecha, setFecha] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [os, setOs] = useState("");           // número de OS seleccionado
  const [ordenes, setOrdenes] = useState([]); // catálogo de órdenes de servicio

  const [cantidad, setCantidad] = useState(1);
  const [codigoSel, setCodigoSel] = useState("");

  const [catalogo, setCatalogo] = useState([]); // /api/codigos/options
  const [rows, setRows] = useState([]);

  const totalRows = useMemo(
    () => rows.reduce((a, r) => a + Number(r.cantidad || 0), 0),
    [rows]
  );

  // ---------- Catálogo de refacciones ----------
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/codigos/options`, {
          credentials: "include",
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message || "No se pudo cargar catálogo");
        setCatalogo(j.data || []);
      } catch (e) {
        console.error(e);
        setCatalogo([]);
      }
    })();
  }, []);

  // ---------- Catálogo de órdenes de servicio ----------
  useEffect(() => {
  (async () => {
    try {
      const r = await fetch(`${API}/salidas/ordenes`, {
        credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || 'No se pudieron cargar órdenes');
      setOrdenes(j.data || []);
    } catch (err) {
      console.error(err);
    }
  })();
}, []);


  async function resolverUnidad(codigoInterno) {
    try {
      const r = await fetch(
        `${API}/inventario/${encodeURIComponent(codigoInterno)}/unidad`,
        { credentials: "include" }
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      return j?.unidad || "Pieza";
    } catch {
      return "Pieza";
    }
  }

  async function agregar() {
    if (!codigoSel) return alert("Selecciona una refacción");
    if (cantidad <= 0) return alert("Cantidad inválida");
    if (!os) return alert("Selecciona una Orden de Servicio.");

    const prod = catalogo.find((x) => x._id === codigoSel);
    const [numParte, marca] = (prod?.label || "").split(" - ");
    const unidad = await resolverUnidad(codigoSel);

    setRows((prev) => [
      ...prev,
      {
        codigoInterno: codigoSel,
        codigoLabel: prod?.label || codigoSel,
        descripcion: prod?.descripcion || "",
        marca: marca || "",
        unidad,
        cantidad: Number(cantidad || 0),
        os: os || "",
      },
    ]);
  }

  function borrar(idx) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function finalizar() {
    if (rows.length === 0)
      return alert("Agrega al menos una refacción.");
    if (!os) return alert("Selecciona una Orden de Servicio.");

    try {
      const payload = {
        fechaSalida: fecha,
        ordenServicio: os || "",
        partidas: rows.map((r) => ({
          codigoInterno: r.codigoInterno,
          descripcion: r.descripcion || r.codigoLabel,
          marca: r.marca,
          unidad: r.unidad,
          cantidad: r.cantidad,
        })),
      };

      const r = await fetch(`${API}/salidas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const text = await r.text();
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        j = { message: text };
      }
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);

      alert("¡Salida registrada!");
      setRows([]);
      setCantidad(1);
      setCodigoSel("");
      // si quieres limpiar la OS:
      // setOs("");
    } catch (e) {
      console.error(e);
      alert(e.message || "Error al guardar la salida.");
    }
  }

  return (
    <div className="container-fluid py-3">
      <div className="row justify-content-center">
        <div className="col-12 col-xxl-10">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0">
              <h2 className="h4 text-center mb-0">SALIDA DE INVENTARIO</h2>
            </div>

            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-3">
                  <label className="form-label">Fecha Salida:</label>
                  <input
                    type="date"
                    className="form-control"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Orden de Servicio:</label>
                  <select
                    className="form-select"
                    value={os}
                    onChange={e => setOs(e.target.value)}
                  >
                    <option value="">Seleccione una OS...</option>
                    {ordenes.map(o => (
                      <option key={o._id} value={o.ordenServicio}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-2">
                  <label className="form-label">Cantidad:</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="form-control"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">Refacción:</label>
                  <select
                    className="form-select"
                    value={codigoSel}
                    onChange={(e) => setCodigoSel(e.target.value)}
                  >
                    <option value="">Select an Option</option>
                    {catalogo.map((o) => (
                      <option key={o._id} value={o._id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="d-flex justify-content-end mt-3">
                <button className="btn btn-primary" onClick={agregar}>
                  Agregar
                </button>
              </div>
            </div>

            <div className="table-responsive px-3">
              <table className="table table-bordered align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Cantidad</th>
                    <th style={{ width: 160 }}>Unidad de Medida</th>
                    <th>Código</th>
                    <th style={{ width: 160 }}>Marca</th>
                    <th style={{ width: 120 }}>OS</th>
                    <th style={{ width: 120 }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4">
                        Sin partidas
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.cantidad}</td>
                        <td>{r.unidad}</td>
                        <td>
                          <div className="fw-semibold">
                            {r.codigoLabel}
                          </div>
                          <div className="small text-muted">
                            {r.descripcion}
                          </div>
                        </td>
                        <td>{r.marca}</td>
                        <td>{r.os || os}</td>
                        <td>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => borrar(i)}
                          >
                            Borrar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}></td>
                    <td className="fw-semibold">Total:</td>
                    <td colSpan={3}>{totalRows}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="d-flex justify-content-end pb-3">
                <button className="btn btn-primary" onClick={finalizar}>
                  Finalizar Captura
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
