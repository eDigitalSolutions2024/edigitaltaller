// src/pages/refaccionaria/components/ModalAltaProveedor.jsx
import { useState } from "react";
import { createProveedor } from "../../../api/providers";

const EMPTY_FORM = {
  nombreProveedor: "", aliasProveedor: "", correo: "",
  telefonoLada: "", telefonoFijo: "", calle: "", numeroExterior: "",
  numeroInterior: "", colonia: "", rfc: "", codigoPostal: "",
  ciudad: "", estado: "", primerContacto: "", segundoContacto: "",
  tercerContacto: "", condicionesPago: "", diasCredito: "", observaciones: "",
};

export default function ModalAltaProveedor({ onProveedorCreado, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (error) setError("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombreProveedor.trim()) return setError("El nombre del proveedor es obligatorio.");

    try {
      setSaving(true);
      setError("");
      const payload = {
        ...form,
        rfc: form.rfc ? String(form.rfc).toUpperCase().trim() : "",
        correo: form.correo ? String(form.correo).toLowerCase().trim() : "",
        diasCredito: form.diasCredito === "" ? undefined : Number(form.diasCredito),
      };
      const resp = await createProveedor(payload);
      const { data } = resp;
      if (!data?.success) throw new Error(data?.message || "Error al guardar");

      onProveedorCreado(data.data); // avisa al padre con el nuevo proveedor
    } catch (err) {
      setError(err.response?.data?.errors?.join(", ") || err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    // Backdrop
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 1060, display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal */}
      <div style={{
        background: "#fff", borderRadius: 8, width: "100%", maxWidth: 700,
        maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px", borderBottom: "1px solid #dee2e6",
          position: "sticky", top: 0, background: "#fff", zIndex: 1,
        }}>
          <h5 className="mb-0 fw-bold">Nuevo Proveedor</h5>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>

        {/* Body */}
        <div style={{ padding: "24px" }}>
          <form onSubmit={onSubmit} autoComplete="off">
            {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}

            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-semibold">Nombre del Proveedor *</label>
                <input name="nombreProveedor" className="form-control" value={form.nombreProveedor} onChange={onChange} required />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Alias Proveedor</label>
                <input name="aliasProveedor" className="form-control" value={form.aliasProveedor} onChange={onChange} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Correo Electrónico</label>
                <input name="correo" type="email" className="form-control" value={form.correo} onChange={onChange} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Teléfono (LADA + Número)</label>
                <div className="d-flex gap-2">
                  <input name="telefonoLada" className="form-control" style={{ maxWidth: 90 }} placeholder="LADA" value={form.telefonoLada} onChange={onChange} />
                  <input name="telefonoFijo" className="form-control" placeholder="Número" value={form.telefonoFijo} onChange={onChange} />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">RFC</label>
                <input name="rfc" className="form-control" value={form.rfc} onChange={onChange} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Calle</label>
                <input name="calle" className="form-control" value={form.calle} onChange={onChange} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Núm. Exterior</label>
                <input name="numeroExterior" className="form-control" value={form.numeroExterior} onChange={onChange} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Núm. Interior</label>
                <input name="numeroInterior" className="form-control" value={form.numeroInterior} onChange={onChange} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Colonia</label>
                <input name="colonia" className="form-control" value={form.colonia} onChange={onChange} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Código Postal</label>
                <input name="codigoPostal" className="form-control" value={form.codigoPostal} onChange={onChange} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Ciudad</label>
                <input name="ciudad" className="form-control" value={form.ciudad} onChange={onChange} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Estado</label>
                <input name="estado" className="form-control" value={form.estado} onChange={onChange} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Primer Contacto</label>
                <input name="primerContacto" className="form-control" value={form.primerContacto} onChange={onChange} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Segundo Contacto</label>
                <input name="segundoContacto" className="form-control" value={form.segundoContacto} onChange={onChange} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Tercer Contacto</label>
                <input name="tercerContacto" className="form-control" value={form.tercerContacto} onChange={onChange} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Condiciones de Pago</label>
                <select name="condicionesPago" className="form-select" value={form.condicionesPago} onChange={onChange}>
                  <option value="">Selecciona...</option>
                  <option value="contado">Contado</option>
                  <option value="credito">Crédito</option>
                  <option value="mixto">Mixto</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Días de Crédito</label>
                <input name="diasCredito" type="number" min="0" className="form-control" value={form.diasCredito} onChange={onChange} />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold">Observaciones</label>
                <textarea name="observaciones" className="form-control" rows={3} value={form.observaciones} onChange={onChange} />
              </div>
            </div>

            {/* Footer */}
            <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Guardando..." : "Guardar Proveedor"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}