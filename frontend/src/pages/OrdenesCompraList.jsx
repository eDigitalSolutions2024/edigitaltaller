// src/pages/OrdenesCompraList.jsx
import { useEffect, useState } from "react";
import {
  fetchOrdenesCompra,
  downloadOrdenCompraPdf,
} from "../api/ordenesCompra";

const ESTADOS = [
  { value: "", label: "Todos" },
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "EN_PROCESO", label: "En proceso" },
  { value: "COMPRADO", label: "Comprado" },
  { value: "CANCELADO", label: "Cancelado" },
];

export default function OrdenesCompraList() {
  const [items, setItems] = useState([]);
  const [estado, setEstado] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchOrdenesCompra({
        estado,
        search,
      });
      setItems(data);
    } catch (err) {
      console.error(err);
      alert("Error al cargar órdenes de compra.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    loadData();
  };

  return (
    <div className="container-fluid">
      <div className="card shadow-sm">
        <div className="card-body">
          <h4 className="mb-3 fw-bold">Órdenes de compra</h4>

          {/* Filtros */}
          <form
            className="row g-2 align-items-end mb-3"
            onSubmit={handleSubmit}
          >
            <div className="col-md-3">
              <label className="form-label mb-1">Estado</label>
              <select
                className="form-select form-select-sm"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
              >
                {ESTADOS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label className="form-label mb-1">
                Buscar (proveedor / número / OS / placas)
              </label>
              <input
                className="form-control form-control-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ej. Autozone, OC-2025..., ABC-123..."
              />
            </div>

            <div className="col-md-2">
              <button
                type="submit"
                className="btn btn-sm btn-primary w-100"
                disabled={loading}
              >
                {loading ? "Buscando..." : "Buscar"}
              </button>
            </div>
          </form>

          {/* Tabla */}
          <div className="table-responsive">
            <table className="table table-sm table-bordered align-middle">
              <thead className="table-light text-center">
                <tr>
                  <th>#</th>
                  <th>No. OC</th>
                  <th>Estado</th>
                  <th>Proveedor</th>
                  <th>Orden Servicio</th>
                  <th>Vehículo</th>
                  <th>Placas / Económico</th>
                  <th>Fecha creación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="text-center text-muted">
                      No hay órdenes de compra registradas.
                    </td>
                  </tr>
                )}

                {items.map((oc, idx) => (
                  <tr key={oc._id}>
                    <td className="text-center">{idx + 1}</td>
                    <td className="text-center fw-semibold">{oc.numero}</td>
                    <td className="text-center">
                      <span className={`badge bg-${
                        oc.estatus === "COMPRADO"
                          ? "success"
                          : oc.estatus === "CANCELADO"
                          ? "danger"
                          : oc.estatus === "EN_PROCESO"
                          ? "warning"
                          : "secondary"
                      }`}>
                        {oc.estatus}
                      </span>
                    </td>
                    <td>{oc.proveedor || "-"}</td>
                    <td className="text-center">
                      {oc.orden?.ordenServicio || "-"}
                    </td>
                    <td>
                      {oc.orden
                        ? `${oc.orden.marca || ""} ${oc.orden.modelo || ""} ${
                            oc.orden.anio || ""
                          }`
                        : "-"}
                    </td>
                    <td className="text-center">
                      {oc.orden
                        ? `${oc.orden.placas || ""} / ${
                            oc.orden.numeroEconomico || ""
                          }`
                        : "-"}
                    </td>
                    <td className="text-center">
                      {new Date(oc.createdAt).toLocaleString("es-MX")}
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => downloadOrdenCompraPdf(oc._id)}
                      >
                        Ver PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
