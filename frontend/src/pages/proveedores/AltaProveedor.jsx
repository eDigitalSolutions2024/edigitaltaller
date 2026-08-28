// src/pages/proveedores/AltaProveedor.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Dropdown from "../../components/Dropdown";
import {
  createProveedor,
  getProveedor,
  updateProveedor,
} from "../../api/providers";
import "../../styles/clientes.css";

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

  if (loadingData) {
    return (
      <div className="form-card">
        <p>Cargando datos del proveedor...</p>
      </div>
    );
  }

  return (
    <form
      className="form-card"
      onSubmit={onSubmit}
      autoComplete="off"
      onKeyDownCapture={handleFormKeyDownCapture}
    >
      <h2>{isEdit ? "Editar Proveedor" : "Alta de Proveedores"}</h2>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      <div className="form-section">
        <h3 className="form-section-title">Datos generales</h3>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="nombreProveedor">Nombre del Proveedor *</label>
            <input
              id="nombreProveedor"
              name="nombreProveedor"
              type="text"
              value={form.nombreProveedor}
              onChange={onChange}
              required
            />
          </div>

          <div className="form-row">
            <label htmlFor="aliasProveedor">Alias Proveedor</label>
            <input
              id="aliasProveedor"
              name="aliasProveedor"
              value={form.aliasProveedor}
              onChange={onChange}
            />
          </div>

          <div className="form-row">
            <label htmlFor="rfc">RFC</label>
            <input
              id="rfc"
              name="rfc"
              value={form.rfc}
              onChange={onChange}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Contacto</h3>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="correo">Correo Electrónico</label>
            <input
              id="correo"
              name="correo"
              type="email"
              value={form.correo}
              onChange={onChange}
              autoComplete="email"
            />
          </div>

          <div className="form-row">
            <label>Teléfono Fijo</label>
            <div className="phone-inline">
              <input
                id="telefonoLada"
                name="telefonoLada"
                value={form.telefonoLada}
                onChange={onChange}
                placeholder="LADA"
                autoComplete="tel-area-code"
              />
              <input
                id="telefonoFijo"
                name="telefonoFijo"
                value={form.telefonoFijo}
                onChange={onChange}
                placeholder="Número"
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="primerContacto">Primer Contacto</label>
            <input
              id="primerContacto"
              name="primerContacto"
              value={form.primerContacto}
              onChange={onChange}
            />
          </div>

          <div className="form-row">
            <label htmlFor="segundoContacto">Segundo Contacto</label>
            <input
              id="segundoContacto"
              name="segundoContacto"
              value={form.segundoContacto}
              onChange={onChange}
            />
          </div>

          <div className="form-row">
            <label htmlFor="tercerContacto">Tercer Contacto</label>
            <input
              id="tercerContacto"
              name="tercerContacto"
              value={form.tercerContacto}
              onChange={onChange}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Dirección</h3>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="calle">Dirección (Calle)</label>
            <input
              id="calle"
              name="calle"
              value={form.calle}
              onChange={onChange}
              autoComplete="address-line1"
            />
          </div>

          <div className="form-row">
            <label htmlFor="numeroExterior">Número Exterior</label>
            <input
              id="numeroExterior"
              name="numeroExterior"
              value={form.numeroExterior}
              onChange={onChange}
            />
          </div>

          <div className="form-row">
            <label htmlFor="numeroInterior">Número Interior</label>
            <input
              id="numeroInterior"
              name="numeroInterior"
              value={form.numeroInterior}
              onChange={onChange}
            />
          </div>

          <div className="form-row">
            <label htmlFor="colonia">Colonia</label>
            <input
              id="colonia"
              name="colonia"
              value={form.colonia}
              onChange={onChange}
            />
          </div>

          <div className="form-row">
            <label htmlFor="codigoPostal">Código Postal</label>
            <input
              id="codigoPostal"
              name="codigoPostal"
              value={form.codigoPostal}
              onChange={onChange}
              autoComplete="postal-code"
            />
          </div>

          <div className="form-row">
            <label htmlFor="ciudad">Ciudad</label>
            <input
              id="ciudad"
              name="ciudad"
              value={form.ciudad}
              onChange={onChange}
              autoComplete="address-level2"
            />
          </div>

          <div className="form-row">
            <label htmlFor="estado">Estado</label>
            <input
              id="estado"
              name="estado"
              value={form.estado}
              onChange={onChange}
              autoComplete="address-level1"
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Condiciones comerciales</h3>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="condicionesPago">Condiciones de Pago</label>
            <Dropdown
              id="condicionesPago"
              name="condicionesPago"
              value={form.condicionesPago}
              onChange={onChange}
            >
              <Dropdown.Option value="">Selecciona...</Dropdown.Option>
              <Dropdown.Option value="contado">Contado</Dropdown.Option>
              <Dropdown.Option value="credito">Crédito</Dropdown.Option>
              <Dropdown.Option value="mixto">Mixto</Dropdown.Option>
            </Dropdown>
          </div>

          <div className="form-row">
            <label htmlFor="diasCredito">Días de Crédito</label>
            <input
              id="diasCredito"
              name="diasCredito"
              type="number"
              min="0"
              value={form.diasCredito}
              onChange={onChange}
            />
          </div>

          <div className="form-row col-12">
            <label htmlFor="observaciones">
              Observaciones (Días de Pago, Formas de Pago Especial, C/R, Etc.)
            </label>
            <textarea
              id="observaciones"
              name="observaciones"
              rows={3}
              value={form.observaciones}
              onChange={onChange}
            />
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Guardar"}
        </button>
        {!isEdit && (
          <button
            type="button"
            className="btn btn-light"
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
  );
}
