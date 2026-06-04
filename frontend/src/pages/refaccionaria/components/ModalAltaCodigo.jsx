// src/pages/refaccionaria/components/ModalAltaCodigo.jsx
import { useEffect, useState } from "react";
import ModalAltaProveedor from "./ModalAltaProveedor";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

export default function ModalAltaCodigo({ onCodigoCreado, onClose }) {
  const [tipo, setTipo] = useState("refaccion");
  const [loading, setLoading] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [showModalProveedor, setShowModalProveedor] = useState(false);

  const [form, setForm] = useState({
    numeroParte: "",
    descripcion: "",
    proveedor: "",
    grupoServicio: "otros",
    codigoSat: "",
    descripcionSat: "",
  });

  // Cargar proveedores
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const r = await fetch(`${API}/proveedores?limit=200&soloActivos=true`, {
          credentials: "include",
        });
        const json = await r.json().catch(() => ({}));
        if (!abort) setProveedores(json?.data || []);
      } catch {
        if (!abort) setProveedores([]);
      }
    })();
    return () => { abort = true; };
  }, []);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleTipoClick = (nuevoTipo) => {
    setTipo(nuevoTipo);
    setForm((f) => ({
      ...f,
      grupoServicio: nuevoTipo === "servicio" ? "motor" : "otros",
      proveedor: "",
    }));
  };

  const handleProveedorCreado = (nuevoProveedor) => {
    setProveedores((prev) => [...prev, nuevoProveedor]);
    setForm((f) => ({ ...f, proveedor: nuevoProveedor.nombreProveedor || nuevoProveedor.nombre || "" }));
    setShowModalProveedor(false);
  };

  const guardar = async () => {
    try {
      setLoading(true);

      if (!form.numeroParte.trim())
        throw new Error("El código interno es obligatorio.");

      const payload = {
        tipo,
        codigo: form.numeroParte.trim(),
        numeroParte: form.numeroParte.trim(),
        descripcion: form.descripcion.trim(),
        proveedor: tipo === "servicio" ? "" : form.proveedor.trim(),
        codigoSat: form.codigoSat.trim(),
        descripcionSat: form.descripcionSat.trim(),
        ...(tipo === "servicio" && { grupoServicio: form.grupoServicio || "otros" }),
      };

      const r = await fetch(`${API}/codigos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "No se pudo guardar");

      // Devuelve el nuevo código al padre para que lo seleccione
      onCodigoCreado(j.data || { ...payload, _id: j._id || j.id });
    } catch (e) {
      alert(e.message || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1050 }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="modal fade show d-block"
        style={{ zIndex: 1055 }}
        role="dialog"
      >
        <div className="modal-dialog modal-lg modal-dialog-centered">
          <div className="modal-content">

            {/* Header */}
            <div className="modal-header">
              <h5 className="modal-title">Dar de alta nuevo código</h5>
              <button
                type="button"
                className="btn-close"
                onClick={onClose}
                aria-label="Cerrar"
              />
            </div>

            {/* Body */}
            <div className="modal-body">

              {/* Toggle tipo */}
              <div className="d-flex justify-content-between align-items-center mb-3">
                <small className="text-muted">
                  Tipo:{" "}
                  <strong>{tipo === "servicio" ? "SERVICIO" : "REFACCIÓN"}</strong>
                </small>
                <div className="btn-group btn-group-sm" role="group">
                  <button
                    type="button"
                    className={"btn " + (tipo === "refaccion" ? "btn-primary" : "btn-outline-primary")}
                    onClick={() => handleTipoClick("refaccion")}
                  >
                    Refacción
                  </button>
                  <button
                    type="button"
                    className={"btn " + (tipo === "servicio" ? "btn-primary" : "btn-outline-primary")}
                    onClick={() => handleTipoClick("servicio")}
                  >
                    Servicio
                  </button>
                </div>
              </div>

              <div className="row g-3">
                {/* Código interno */}
                <div className="col-md-4">
                  <label className="form-label">Código interno <span className="text-danger">*</span></label>
                  <input
                    className="form-control"
                    name="numeroParte"
                    value={form.numeroParte}
                    onChange={onChange}
                    placeholder="Ej. R001"
                    autoFocus
                  />
                </div>

                {/* Descripción */}
                <div className="col-md-8">
                  <label className="form-label">Descripción</label>
                  <input
                    className="form-control"
                    name="descripcion"
                    value={form.descripcion}
                    onChange={onChange}
                    placeholder="Descripción del código"
                  />
                </div>

                {/* Proveedor — solo refacciones */}
                {tipo === "refaccion" && (
                  <div className="col-md-6">
                    <label className="form-label">Proveedor</label>
                    <select
                      className="form-select"
                      name="proveedor"
                      value={form.proveedor}
                      onChange={(e) => {
                        if (e.target.value === "__nuevo__") {
                          setShowModalProveedor(true);
                          return;
                        }
                        setForm((f) => ({ ...f, proveedor: e.target.value }));
                      }}
                    >
                      <option value="">— Selecciona —</option>
                      {proveedores.map((p) => (
                        <option key={p._id} value={p.nombreProveedor || p.nombre || p.aliasProveedor}>
                          {p.nombreProveedor || p.nombre || p.aliasProveedor || p.rfc}
                        </option>
                      ))}
                      <option value="__nuevo__">➕ Dar de alta nuevo proveedor...</option>
                    </select>
                  </div>
                )}

                {/* Grupo de servicio — solo servicios */}
                {tipo === "servicio" && (
                  <div className="col-md-6">
                    <label className="form-label">Grupo de servicio</label>
                    <select
                      className="form-select"
                      name="grupoServicio"
                      value={form.grupoServicio}
                      onChange={onChange}
                    >
                      <option value="motor">Mantenimiento del motor</option>
                      <option value="lubricacion">Lubricación</option>
                      <option value="revision">Revisión</option>
                      <option value="otros">Otros servicios</option>
                    </select>
                  </div>
                )}

                {/* Datos SAT — solo servicios */}
                {tipo === "servicio" && (
                  <>
                    <div className="col-12">
                      <h6 className="fw-bold border-bottom pb-1 mb-0 mt-1">
                        Datos SAT{" "}
                        <small className="text-muted fw-normal">
                          (requerido cuando el cliente solicita factura)
                        </small>
                      </h6>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Código SAT</label>
                      <input
                        className="form-control"
                        name="codigoSat"
                        value={form.codigoSat}
                        onChange={onChange}
                      />
                    </div>
                    <div className="col-md-8">
                      <label className="form-label">Descripción SAT</label>
                      <input
                        className="form-control"
                        name="descripcionSat"
                        value={form.descripcionSat}
                        onChange={onChange}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary px-4"
                onClick={guardar}
                disabled={loading}
              >
                {loading ? "Guardando..." : "Guardar código"}
              </button>
            </div>

          </div>
        </div>
      </div>

      {showModalProveedor && (
        <ModalAltaProveedor
          onProveedorCreado={handleProveedorCreado}
          onClose={() => setShowModalProveedor(false)}
        />
      )}

    </>
  );
}