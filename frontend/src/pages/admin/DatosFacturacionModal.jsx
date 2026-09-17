import React, { useEffect, useState } from "react";
import Dropdown from "../../components/Dropdown";
import { REGIMEN_FISCAL_OPTIONS } from "../../utils/regimenFiscal";
import { crearClienteDesdePersonal, updateCustomer } from "../../api/customers";

const CAMPOS_REQUERIDOS = [
  "rfc", "regimenFiscal", "codigoPostalFiscal",
  "calle", "numeroExterior", "colonia", "ciudad", "estado",
];

const DRAFT_VACIO = {
  rfc: "", regimenFiscal: "", codigoPostalFiscal: "",
  calle: "", numeroExterior: "", numeroInterior: "", colonia: "", ciudad: "", estado: "",
};

// Administración → Personal → "Facturación": datos fiscales opcionales de la
// ficha de Cliente ligada a esta persona (Empleado o usuario "solo_usuario").
// No se piden al dar de alta en Personal — solo hacen falta el día que a
// alguien le toque facturar una orden y le falten; se guardan aquí con el
// mismo criterio/campos que la captura de "faltan datos fiscales" de Nueva
// Factura (ver guardarFiscalCliente en NuevaFactura.jsx), reutilizando la
// misma ficha de Cliente que usa el botón "Empleados" de Nueva Orden.
export default function DatosFacturacionModal({ show, persona, onClose }) {
  const [clienteId, setClienteId] = useState(null);
  const [draft, setDraft] = useState(DRAFT_VACIO);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!show || !persona) return;
    setError("");
    setGuardado(false);
    setDraft(DRAFT_VACIO);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, persona]);

  async function cargar() {
    try {
      setLoading(true);
      const res = await crearClienteDesdePersonal({
        empleadoId: persona.empleadoId,
        userId: persona.userId,
      });
      const c = res.data?.data;
      setClienteId(c?._id || null);
      const d = c?.direccion || {};
      setDraft({
        rfc: c?.rfc || "",
        regimenFiscal: c?.regimenFiscal || "",
        codigoPostalFiscal: c?.codigoPostalFiscal || "",
        calle: d.calle || "",
        numeroExterior: d.numeroExterior || "",
        numeroInterior: d.numeroInterior || "",
        colonia: d.colonia || "",
        ciudad: d.ciudad || "",
        estado: d.estado || "",
      });
    } catch (err) {
      console.error("Error cargando datos de facturación:", err);
      setError(
        err?.response?.data?.error || "No se pudieron cargar los datos de facturación."
      );
    } finally {
      setLoading(false);
    }
  }

  function upd(campo, valor) {
    setDraft((prev) => ({ ...prev, [campo]: valor }));
    setGuardado(false);
  }

  async function handleGuardar() {
    const limpio = Object.fromEntries(
      Object.entries(draft).map(([k, v]) => [k, String(v || "").trim()])
    );
    const faltan = CAMPOS_REQUERIDOS.some((c) => !limpio[c]);
    if (faltan) {
      setError(
        "Completa RFC, régimen fiscal, CP fiscal y la dirección fiscal (calle, número exterior, colonia, ciudad y estado)."
      );
      return;
    }
    if (!clienteId) return;

    try {
      setGuardando(true);
      setError("");
      await updateCustomer(clienteId, {
        rfc: limpio.rfc.toUpperCase(),
        regimenFiscal: limpio.regimenFiscal,
        codigoPostalFiscal: limpio.codigoPostalFiscal,
        direccion: {
          calle: limpio.calle,
          numeroExterior: limpio.numeroExterior,
          numeroInterior: limpio.numeroInterior,
          colonia: limpio.colonia,
          codigoPostal: limpio.codigoPostalFiscal,
          ciudad: limpio.ciudad,
          estado: limpio.estado,
        },
        requiereFacturacion: true,
      });
      setGuardado(true);
    } catch (err) {
      console.error("Error guardando datos de facturación:", err);
      setError(
        err?.response?.data?.error || "No se pudieron guardar los datos de facturación."
      );
    } finally {
      setGuardando(false);
    }
  }

  if (!show) return null;

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">
              Datos de facturación{persona?.nombre ? ` — ${persona.nombre}` : ""}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <p className="text-muted">
              Solo hacen falta el día que se le vaya a facturar (CFDI) una orden a esta
              persona. Se guardan en la misma ficha de cliente que usa el botón
              "Empleados" de Nueva Orden de Servicio.
            </p>

            {loading && <p className="text-muted">Cargando...</p>}
            {error && <p className="text-danger">{error}</p>}
            {guardado && <p className="text-success">Datos guardados correctamente.</p>}

            {!loading && (
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label fw-semibold">RFC</label>
                  <input
                    className="form-control"
                    value={draft.rfc}
                    onChange={(e) => upd("rfc", e.target.value.toUpperCase())}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold">Régimen Fiscal</label>
                  <Dropdown
                    value={draft.regimenFiscal}
                    onChange={(e) => upd("regimenFiscal", e.target.value)}
                  >
                    <Dropdown.Option value="">-- Seleccionar --</Dropdown.Option>
                    {REGIMEN_FISCAL_OPTIONS.map((o) => (
                      <Dropdown.Option key={o.value} value={o.value}>{o.label}</Dropdown.Option>
                    ))}
                  </Dropdown>
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold">Código Postal fiscal</label>
                  <input
                    className="form-control"
                    value={draft.codigoPostalFiscal}
                    onChange={(e) => upd("codigoPostalFiscal", e.target.value)}
                  />
                </div>
                <div className="col-md-8">
                  <label className="form-label fw-semibold">Calle</label>
                  <input
                    className="form-control"
                    value={draft.calle}
                    onChange={(e) => upd("calle", e.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold">Número Exterior</label>
                  <input
                    className="form-control"
                    value={draft.numeroExterior}
                    onChange={(e) => upd("numeroExterior", e.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold">Número Interior</label>
                  <input
                    className="form-control"
                    value={draft.numeroInterior}
                    onChange={(e) => upd("numeroInterior", e.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold">Colonia</label>
                  <input
                    className="form-control"
                    value={draft.colonia}
                    onChange={(e) => upd("colonia", e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold">Ciudad</label>
                  <input
                    className="form-control"
                    value={draft.ciudad}
                    onChange={(e) => upd("ciudad", e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold">Estado</label>
                  <input
                    className="form-control"
                    value={draft.estado}
                    onChange={(e) => upd("estado", e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading || guardando}
              onClick={handleGuardar}
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
