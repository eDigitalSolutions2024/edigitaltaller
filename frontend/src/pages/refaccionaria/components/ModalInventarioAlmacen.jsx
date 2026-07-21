import { useEffect, useState } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

// Selector de piezas desde el inventario de almacén — usado tanto al cotizar
// una solicitud de taller (SolicitudTallerDetalle.jsx) como al completar el
// detalle de una refacción de Servicio de catálogo antes de surtirla
// (ModalCotizarSurtido.jsx).
export default function ModalInventarioAlmacen({ onSelect, onClose }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    fetch(`${API}/inventario`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setItems(j?.data || []))
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, []);

  const filtrados = items.filter((item) => {
    const q = busqueda.toLowerCase();
    return (
      (item.codigo || "").toLowerCase().includes(q) ||
      (item.descripcion || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1040 }}
      />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 1050, width: "90%", maxWidth: 680, maxHeight: "80vh",
          background: "white", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <span className="fw-bold">Inventario Almacén</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>

        <div className="p-3 border-bottom">
          <input
            autoFocus
            className="form-control form-control-sm"
            placeholder="Buscar por código o descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {cargando ? (
            <div className="text-center py-4 text-muted">Cargando inventario...</div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-4 text-muted">Sin resultados.</div>
          ) : (
            <table className="table table-hover table-sm mb-0">
              <thead className="table-light" style={{ position: "sticky", top: 0 }}>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Unidad</th>
                  <th style={{ width: 100 }}>Existencia</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((item) => (
                  <tr
                    key={item._id}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelect(item)}
                  >
                    <td>{item.codigo || "—"}</td>
                    <td>{item.descripcion || "—"}</td>
                    <td>{item.unidad || "—"}</td>
                    <td className="text-center">
                      {item.cantidad > 0 ? (
                        <span className="badge bg-success">{item.cantidad}</span>
                      ) : (
                        <span className="badge bg-danger">Sin stock</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-top d-flex justify-content-end">
          <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </>
  );
}
