import React, { useEffect, useState } from "react";
import api from "../../api/http";

export default function ConfiguracionFiscal() {
  const [form, setForm] = useState({
    rfc: "",
    nombre: "",
    regimenFiscal: "",
    lugarExpedicion: "",
    serie: "",
    folioInterno: "",
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [certStatus, setCertStatus] = useState({
    cargado: false,
    noCertificado: "",
    nombreArchivo: "",
  });

  const [keyStatus, setKeyStatus] = useState({
    cargado: false,
    nombreArchivo: "",
  });

  // 👇 para mostrar el nombre aunque se limpie el input
  const [cerSelectedName, setCerSelectedName] = useState("");
  const [keySelectedName, setKeySelectedName] = useState("");

  const [keyPass, setKeyPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const res = await api.get("/fiscal-config");
      if (res.data?.ok && res.data.data) {
        const d = res.data.data;

        setForm({
          rfc: d.rfc || "",
          nombre: d.nombre || "",
          regimenFiscal: d.regimenFiscal || "",
          lugarExpedicion: d.lugarExpedicion || "",
          serie: d.serie || "",
          folioInterno: d.folioInterno || "",
        });

        setCertStatus({
          cargado: !!d.certificadoBase64,
          noCertificado: d.noCertificado || "",
          nombreArchivo: d.certificadoNombreArchivo || "",
        });

        setKeyStatus({
          cargado: !!d.keyPemCargado,
          nombreArchivo: d.keyNombreArchivo || "",
        });
      }
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  async function guardar() {
    setLoading(true);
    setMsg("");
    try {
      const payload = {
        ...form,
        rfc: (form.rfc || "").trim().toUpperCase(),
        nombre: (form.nombre || "").trim().toUpperCase(),
      };

      const res = await api.post("/fiscal-config", payload);
      if (res.data?.ok) {
        setMsg("✅ Configuración fiscal guardada");
        await load();
      } else {
        setMsg(res.data?.error || "Error");
      }
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function subirCer(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCerSelectedName(file.name);

    setLoading(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await api.post("/fiscal-config/cert", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.ok) {
        setMsg("✅ Certificado cargado");
        await load();
      } else {
        setMsg(res.data?.error || "Error subiendo certificado");
      }
    } catch (e2) {
      setMsg(e2?.response?.data?.error || e2.message);
    } finally {
      setLoading(false);
      e.target.value = ""; // limpiamos input (normal)
    }
  }

  async function subirKey(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setKeySelectedName(file.name);

    if (!keyPass || keyPass.trim().length === 0) {
      setMsg("❌ Captura la contraseña del .key antes de subirlo");
      e.target.value = "";
      return;
    }

    setLoading(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("password", keyPass);

      const res = await api.post("/fiscal-config/key", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.ok) {
        setMsg("✅ Llave (.key) cargada y convertida a PEM");
        setKeyPass("");
        await load();
      } else {
        setMsg(res.data?.error || "Error subiendo llave");
      }
    } catch (e2) {
      setMsg(e2?.response?.data?.error || e2.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <h2 className="mb-1">Configuración fiscal</h2>
      <p className="text-muted mb-4">Emisor, series/folios y certificados SAT</p>

      {msg ? <div className="alert alert-info py-2">{msg}</div> : null}

      {/* Datos del emisor */}
      <div className="card mb-4">
        <div className="card-header fw-bold">Datos del emisor</div>
        <div className="card-body row g-3">
          <div className="col-md-6">
            <label className="form-label">RFC</label>
            <input name="rfc" className="form-control" value={form.rfc} onChange={onChange} />
          </div>

          <div className="col-md-6">
            <label className="form-label">Nombre / Razón social</label>
            <input name="nombre" className="form-control" value={form.nombre} onChange={onChange} />
          </div>

          <div className="col-md-6">
            <label className="form-label">Régimen fiscal</label>
            <input name="regimenFiscal" className="form-control" value={form.regimenFiscal} onChange={onChange} />
          </div>

          <div className="col-md-6">
            <label className="form-label">Lugar de expedición (CP)</label>
            <input name="lugarExpedicion" className="form-control" value={form.lugarExpedicion} onChange={onChange} />
          </div>

          <div className="col-md-3">
            <label className="form-label">Serie</label>
            <input name="serie" className="form-control" value={form.serie} onChange={onChange} />
          </div>

          <div className="col-md-3">
            <label className="form-label">Folio interno</label>
            <input name="folioInterno" className="form-control" value={form.folioInterno} onChange={onChange} />
          </div>
        </div>
      </div>

      {/* Certificados */}
      <div className="card mb-4">
        <div className="card-header fw-bold">Certificados SAT</div>
        <div className="card-body row g-4">
          {/* CER */}
          <div className="col-md-6">
            <label className="form-label fw-semibold">Certificado (.cer)</label>
            <input type="file" accept=".cer" onChange={subirCer} className="form-control" disabled={loading} />

            <small className="text-muted d-block mt-1">
              {cerSelectedName ? `Seleccionado: ${cerSelectedName}` : "Aún no seleccionado"}
            </small>

            <small className="text-muted d-block mt-1">
              {certStatus.cargado
                ? `✔ Cargado: ${certStatus.nombreArchivo} (NoCert: ${certStatus.noCertificado || "—"})`
                : "Aún no cargado"}
            </small>
          </div>

          {/* KEY */}
          <div className="col-md-6">
            <label className="form-label fw-semibold">Llave privada (.key)</label>

            <div className="input-group mb-2">
              <input
                type={showPass ? "text" : "password"}
                className="form-control"
                placeholder="Contraseña del .key"
                value={keyPass}
                onChange={(e) => setKeyPass(e.target.value)}
                disabled={loading}
              />
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => setShowPass((s) => !s)}
                disabled={loading}
              >
                {showPass ? "Ocultar" : "Ver"}
              </button>
            </div>

            <input type="file" accept=".key" onChange={subirKey} className="form-control" disabled={loading} />

            <small className="text-muted d-block mt-1">
              {keySelectedName ? `Seleccionado: ${keySelectedName}` : "Aún no seleccionado"}
            </small>

            <small className="text-muted d-block mt-1">
              {keyStatus.cargado ? `✔ Cargada: ${keyStatus.nombreArchivo}` : "Aún no cargada"}
            </small>
          </div>
        </div>
      </div>

      <button className="btn btn-danger" onClick={guardar} disabled={loading}>
        {loading ? "Guardando..." : "Guardar configuración"}
      </button>

      <p className="text-muted mt-3 small">
        El sistema valida automáticamente que el <b>.cer</b> y el <b>.key</b> correspondan.
      </p>

      <p className="text-muted small">
        Nota: el sistema genera automáticamente <code>backend/keys/emisor.key.pem</code>.
      </p>
    </div>
  );
}
