// src/pages/proveedores/AltaProveedor.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createProveedor,
  getProveedor,
  updateProveedor,
} from "../../api/providers";

const EMPTY_FORM = {
  nombreProveedor: "",
  aliasProveedor: "",
  correo: "",
  telefonoLada: "",
  telefonoFijo: "",
  calle: "",
  numeroExterior: "",
  numeroInterior: "",
  colonia: "",
  rfc: "",
  codigoPostal: "",
  ciudad: "",
  estado: "",
  primerContacto: "",
  segundoContacto: "",
  tercerContacto: "",
  condicionesPago: "",
  diasCredito: "",
  observaciones: "",
};

export default function AltaProveedor() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  useEffect(() => {
    console.log("AltaProveedor - MONTÓ", { id, isEdit });
    return () => console.log("AltaProveedor - DESMONTÓ");
  }, [id, isEdit]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  // Cargar datos cuando sea edición
  useEffect(() => {
    if (!isEdit) return;

    const fetchProveedor = async () => {
      try {
        setLoadingData(true);
        setError("");
        const { data } = await getProveedor(id);
        if (!data?.success) {
          throw new Error(data?.message || "Error al cargar proveedor.");
        }
        const row = data.data || {};

        setForm({
          nombreProveedor: row.nombreProveedor || "",
          aliasProveedor: row.aliasProveedor || "",
          correo: row.correo || "",
          telefonoLada: row.telefonoLada || "",
          telefonoFijo: row.telefonoFijo || "",
          calle: row.calle || "",
          numeroExterior: row.numeroExterior || "",
          numeroInterior: row.numeroInterior || "",
          colonia: row.colonia || "",
          rfc: row.rfc || "",
          codigoPostal: row.codigoPostal || "",
          ciudad: row.ciudad || "",
          estado: row.estado || "",
          primerContacto: row.primerContacto || "",
          segundoContacto: row.segundoContacto || "",
          tercerContacto: row.tercerContacto || "",
          condicionesPago: row.condicionesPago || "",
          diasCredito:
            row.diasCredito === 0 || row.diasCredito
              ? String(row.diasCredito)
              : "",
          observaciones: row.observaciones || "",
        });
      } catch (err) {
        const msg =
          err.response?.data?.message ||
          err.message ||
          "Error al cargar proveedor.";
        setError(msg);
      } finally {
        setLoadingData(false);
      }
    };

    fetchProveedor();
  }, [id, isEdit]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (error) setError("");
  };

  const validate = () => {
    if (!form.nombreProveedor.trim())
      return "El nombre del proveedor es obligatorio.";
    if (form.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo))
      return "Correo inválido.";
    if (form.diasCredito !== "" && Number(form.diasCredito) < 0)
      return "Días de crédito inválidos.";
    return "";
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);

    try {
      setSaving(true);
      setError("");

      const payload = {
        ...form,
        rfc: form.rfc ? String(form.rfc).toUpperCase().trim() : "",
        correo: form.correo ? String(form.correo).toLowerCase().trim() : "",
        diasCredito:
          form.diasCredito === "" ? undefined : Number(form.diasCredito),
      };

      let resp;
      if (isEdit) {
        // EDITAR
        resp = await updateProveedor(id, payload);
      } else {
        // ALTA
        resp = await createProveedor(payload);
      }

      const { data } = resp;
      if (!data?.success) {
        throw new Error(data?.message || "Error al guardar");
      }

      alert(
        `${isEdit ? "Proveedor actualizado" : "Proveedor guardado"}: ${
          data.data?.nombreProveedor || ""
        }`
      );
      // después de guardar, regresamos a la consulta
      navigate("/proveedores/consultar");
    } catch (err) {
      const msg =
        err.response?.data?.errors?.join(", ") ||
        err.response?.data?.message ||
        err.message;
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const onClear = () => setForm(EMPTY_FORM);

  const handleFormKeyDownCapture = (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  };

  return (
    <div className="container-fluid">
      <h2 className="text-center fw-bold my-3" style={{ letterSpacing: "2px" }}>
        {isEdit ? "EDITAR PROVEEDOR" : "ALTA PROVEEDORES"}
      </h2>

      <div className="card shadow-sm">
        <div className="card-body">
          {loadingData ? (
            <p>Cargando datos del proveedor...</p>
          ) : (
            <form
              onSubmit={onSubmit}
              autoComplete="off"
              onKeyDownCapture={handleFormKeyDownCapture}
            >
              {error && (
                <div className="alert alert-danger py-2">{error}</div>
              )}

              <div className="mb-2">
                <label
                  htmlFor="nombreProveedor"
                  className="form-label fw-semibold"
                >
                  Nombre del Proveedor: *
                </label>
                <input
                  id="nombreProveedor"
                  name="nombreProveedor"
                  type="text"
                  className="form-control"
                  value={form.nombreProveedor}
                  onChange={onChange}
                  required
                />
              </div>

              <div className="mb-2">
                <label
                  htmlFor="aliasProveedor"
                  className="form-label fw-semibold"
                >
                  Alias Proveedor:
                </label>
                <input
                  id="aliasProveedor"
                  name="aliasProveedor"
                  className="form-control"
                  value={form.aliasProveedor}
                  onChange={onChange}
                />
              </div>

              <div className="mb-2">
                <label htmlFor="correo" className="form-label fw-semibold">
                  Correo Electrónico:
                </label>
                <input
                  id="correo"
                  name="correo"
                  type="email"
                  className="form-control"
                  value={form.correo}
                  onChange={onChange}
                  autoComplete="email"
                />
              </div>

              <div className="mb-2">
                <label className="form-label fw-semibold">
                  Teléfono Fijo: LADA
                </label>
                <div className="d-flex gap-2">
                  <input
                    id="telefonoLada"
                    name="telefonoLada"
                    className="form-control"
                    style={{ maxWidth: 120 }}
                    value={form.telefonoLada}
                    onChange={onChange}
                    placeholder="LADA"
                    autoComplete="tel-area-code"
                  />
                  <input
                    id="telefonoFijo"
                    name="telefonoFijo"
                    className="form-control"
                    value={form.telefonoFijo}
                    onChange={onChange}
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="mb-2">
                <label htmlFor="calle" className="form-label fw-semibold">
                  Dirección (Calle):
                </label>
                <input
                  id="calle"
                  name="calle"
                  className="form-control"
                  value={form.calle}
                  onChange={onChange}
                  autoComplete="address-line1"
                />
              </div>

              <div className="mb-2">
                <label
                  htmlFor="numeroExterior"
                  className="form-label fw-semibold"
                >
                  Número Exterior:
                </label>
                <input
                  id="numeroExterior"
                  name="numeroExterior"
                  className="form-control"
                  value={form.numeroExterior}
                  onChange={onChange}
                />
              </div>

              <div className="mb-2">
                <label
                  htmlFor="numeroInterior"
                  className="form-label fw-semibold"
                >
                  Número Interior:
                </label>
                <input
                  id="numeroInterior"
                  name="numeroInterior"
                  className="form-control"
                  value={form.numeroInterior}
                  onChange={onChange}
                />
              </div>

              <div className="mb-2">
                <label htmlFor="colonia" className="form-label fw-semibold">
                  Colonia:
                </label>
                <input
                  id="colonia"
                  name="colonia"
                  className="form-control"
                  value={form.colonia}
                  onChange={onChange}
                />
              </div>

              <div className="mb-2">
                <label htmlFor="rfc" className="form-label fw-semibold">
                  RFC:
                </label>
                <input
                  id="rfc"
                  name="rfc"
                  className="form-control"
                  value={form.rfc}
                  onChange={onChange}
                />
              </div>

              <div className="mb-2">
                <label
                  htmlFor="codigoPostal"
                  className="form-label fw-semibold"
                >
                  Código Postal:
                </label>
                <input
                  id="codigoPostal"
                  name="codigoPostal"
                  className="form-control"
                  value={form.codigoPostal}
                  onChange={onChange}
                  autoComplete="postal-code"
                />
              </div>

              <div className="mb-2">
                <label htmlFor="ciudad" className="form-label fw-semibold">
                  Ciudad:
                </label>
                <input
                  id="ciudad"
                  name="ciudad"
                  className="form-control"
                  value={form.ciudad}
                  onChange={onChange}
                  autoComplete="address-level2"
                />
              </div>

              <div className="mb-2">
                <label htmlFor="estado" className="form-label fw-semibold">
                  Estado:
                </label>
                <input
                  id="estado"
                  name="estado"
                  className="form-control"
                  value={form.estado}
                  onChange={onChange}
                  autoComplete="address-level1"
                />
              </div>

              <div className="mb-2">
                <label
                  htmlFor="primerContacto"
                  className="form-label fw-semibold"
                >
                  Primer Contacto:
                </label>
                <input
                  id="primerContacto"
                  name="primerContacto"
                  className="form-control"
                  value={form.primerContacto}
                  onChange={onChange}
                />
              </div>

              <div className="mb-2">
                <label
                  htmlFor="segundoContacto"
                  className="form-label fw-semibold"
                >
                  Segundo Contacto:
                </label>
                <input
                  id="segundoContacto"
                  name="segundoContacto"
                  className="form-control"
                  value={form.segundoContacto}
                  onChange={onChange}
                />
              </div>

              <div className="mb-2">
                <label
                  htmlFor="tercerContacto"
                  className="form-label fw-semibold"
                >
                  Tercer Contacto:
                </label>
                <input
                  id="tercerContacto"
                  name="tercerContacto"
                  className="form-control"
                  value={form.tercerContacto}
                  onChange={onChange}
                />
              </div>

              <div className="mb-2">
                <label
                  htmlFor="condicionesPago"
                  className="form-label fw-semibold"
                >
                  Condiciones de Pago:
                </label>
                <select
                  id="condicionesPago"
                  name="condicionesPago"
                  className="form-select"
                  value={form.condicionesPago}
                  onChange={onChange}
                >
                  <option value="">Selecciona...</option>
                  <option value="contado">Contado</option>
                  <option value="credito">Crédito</option>
                  <option value="mixto">Mixto</option>
                </select>
              </div>

              <div className="mb-2">
                <label
                  htmlFor="diasCredito"
                  className="form-label fw-semibold"
                >
                  Días de Crédito:
                </label>
                <input
                  id="diasCredito"
                  name="diasCredito"
                  type="number"
                  min="0"
                  className="form-control"
                  value={form.diasCredito}
                  onChange={onChange}
                />
              </div>

              <div className="mb-3">
                <label
                  htmlFor="observaciones"
                  className="form-label fw-semibold"
                >
                  Observaciones (Días de Pago, Formas de Pago Especial, C/R,
                  Etc.):
                </label>
                <textarea
                  id="observaciones"
                  name="observaciones"
                  className="form-control"
                  rows={3}
                  value={form.observaciones}
                  onChange={onChange}
                />
              </div>

              <div className="d-flex gap-2 justify-content-center mt-3">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? "Guardando..."
                    : isEdit
                    ? "Guardar cambios"
                    : "Guardar"}
                </button>
                {!isEdit && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onClear}
                    disabled={saving}
                  >
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => navigate("/proveedores/consultar")}
                  disabled={saving}
                >
                  Regresar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
