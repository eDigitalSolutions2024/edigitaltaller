// src/pages/refaccionaria/BDCodigos.jsx
import { useEffect, useMemo, useState } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";
const PAGE_SIZES = [10, 25, 50, 100];

export default function BDCodigos() {
  const [form, setForm] = useState({
    _id: "",
    tipo: "refaccion",
    numeroParte: "",
    descripcion: "",
    proveedor: "",
    grupoServicio: "otros",
    codigoSat: "",
    descripcionSat: "",
  });

  const [tipo, setTipo] = useState("refaccion");
  const [options, setOptions] = useState([]);
  const [refSel, setRefSel] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "codigo", dir: "asc" });

  useEffect(() => {
    (async () => {
      try {
        const [o, t] = await Promise.all([
          fetch(`${API}/codigos/options`, { credentials: "include" })
            .then((r) => r.json())
            .catch(() => ({})),
          fetch(`${API}/codigos`, { credentials: "include" })
            .then((r) => r.json())
            .catch(() => ({})),
        ]);

        setOptions(o?.data || []);

        const data = (t?.data || t || []).map((x) => ({
          _id: x._id || x.id,
          codigo: x.codigo || "",
          tipo: x.tipo || "refaccion",
          numeroParte: x.numeroParte || "",
          proveedor: x.proveedor || "",
          descripcion: x.descripcion || "",
          grupoServicio: x.grupoServicio || "otros",
          codigoSat: x.codigoSat || "",
          descripcionSat: x.descripcionSat || "",
        }));
        setItems(data);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const nextCode = useMemo(() => {
    const prefix = tipo === "servicio" ? "S" : "R";
    const codesOfType = items
      .filter((x) => (x.tipo || "refaccion") === tipo)
      .map((x) => x.codigo)
      .filter(Boolean)
      .map((c) => {
        const n = parseInt(String(c).replace(/^[RS]/i, ""), 10);
        return Number.isNaN(n) ? 0 : n;
      });
    const max = codesOfType.length ? Math.max(...codesOfType) : 0;
    return prefix + (max + 1);
  }, [items, tipo]);

  const visibleOptions = useMemo(() => {
    return (options || []).filter((o) => {
      const t = o.tipo || "refaccion";
      return tipo === "servicio" ? t === "servicio" : t !== "servicio";
    });
  }, [options, tipo]);

  const filtered = useMemo(() => {
    const q = (query || "").toLowerCase().trim();
    let arr = items.filter((x) => {
      const t = x.tipo || "refaccion";
      return tipo === "servicio" ? t === "servicio" : t !== "servicio";
    });
    if (q) {
      arr = arr.filter(
        (x) =>
          (x.codigo || "").toLowerCase().includes(q) ||
          (x.numeroParte || "").toLowerCase().includes(q) ||
          (x.descripcion || "").toLowerCase().includes(q) ||
          (x.proveedor || "").toLowerCase().includes(q) ||
          (x.codigoSat || "").toLowerCase().includes(q) ||
          (x.descripcionSat || "").toLowerCase().includes(q)
      );
    }
    arr.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const av = String(a[sort.key] || "").toLowerCase();
      const bv = String(b[sort.key] || "").toLowerCase();
      return av.localeCompare(bv) * dir;
    });
    return arr;
  }, [items, query, sort, tipo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageData = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

  function changeSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleTipoClick = (nuevoTipo) => {
    setTipo(nuevoTipo);
    setForm((f) => ({
      ...f,
      tipo: nuevoTipo,
      grupoServicio:
        nuevoTipo === "servicio" ? f.grupoServicio || "motor" : "otros",
    }));
    setPage(1);
  };

  async function guardar() {
    try {
      setLoading(true);
      const payload = {
        tipo: form.tipo || tipo,
        codigo: (form.numeroParte || "").trim(),
        numeroParte: (form.numeroParte || "").trim(),
        descripcion: form.descripcion.trim(),
        proveedor:
          (form.tipo || tipo) === "servicio" ? "" : form.proveedor.trim(),
        codigoSat: form.codigoSat.trim(),
        descripcionSat: form.descripcionSat.trim(),
      };

      if ((form.tipo || tipo) === "servicio") {
        payload.grupoServicio = form.grupoServicio || "otros";
      }

      if (!payload.numeroParte)
        throw new Error("Número de parte / código es obligatorio.");

      const method = form._id ? "PUT" : "POST";
      const url = form._id
        ? `${API}/codigos/${form._id}`
        : `${API}/codigos`;

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "No se pudo guardar");

      await recargarTabla();
      await recargarOptions();
      limpiar();
    } catch (e) {
      alert(e.message || "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  async function recargarTabla() {
    const t = await fetch(`${API}/codigos`, { credentials: "include" })
      .then((r) => r.json())
      .catch(() => ({}));
    const data = (t?.data || t || []).map((x) => ({
      _id: x._id || x.id,
      codigo: x.codigo || "",
      tipo: x.tipo || "refaccion",
      numeroParte: x.numeroParte || "",
      proveedor: x.proveedor || "",
      descripcion: x.descripcion || "",
      grupoServicio: x.grupoServicio || "otros",
      codigoSat: x.codigoSat || "",
      descripcionSat: x.descripcionSat || "",
    }));
    setItems(data);
  }

  async function recargarOptions() {
    const o = await fetch(`${API}/codigos/options`, { credentials: "include" })
      .then((r) => r.json())
      .catch(() => ({}));
    setOptions(o?.data || []);
  }

  function limpiar() {
    setForm({
      _id: "",
      tipo: tipo,
      numeroParte: "",
      descripcion: "",
      proveedor: "",
      grupoServicio: tipo === "servicio" ? "motor" : "otros",
      codigoSat: "",
      descripcionSat: "",
    });
    setRefSel("");
  }

  async function buscarSeleccion() {
    if (!refSel) return;
    const r = await fetch(`${API}/codigos/${refSel}`, {
      credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j?.message || "No encontrado");
    const x = j.data;
    const t = x.tipo || "refaccion";
    setTipo(t);
    setForm({
      _id: x._id,
      tipo: t,
      numeroParte: x.numeroParte || "",
      descripcion: x.descripcion || "",
      proveedor: x.proveedor || "",
      grupoServicio: x.grupoServicio || "otros",
      codigoSat: x.codigoSat || "",
      descripcionSat: x.descripcionSat || "",
    });
  }

  async function eliminar(id) {
    if (!window.confirm("¿Eliminar este código?")) return;
    const r = await fetch(`${API}/codigos/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) return alert("No se pudo eliminar");
    await recargarTabla();
    await recargarOptions();
  }

  const GRUPO_LABELS = {
    motor: "Mantenimiento del motor",
    lubricacion: "Lubricación",
    revision: "Revisión",
    otros: "Otros servicios",
  };

  return (
    <div className="container-fluid py-3">
      <div className="row justify-content-center">
        <div className="col-12 col-xxl-10">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 d-flex justify-content-between align-items-center">
              <h2 className="h4 mb-0">ALTA DE CÓDIGOS</h2>
              <div className="btn-group" role="group">
                <button
                  type="button"
                  className={
                    "btn btn-sm " +
                    (tipo === "refaccion" ? "btn-primary" : "btn-outline-primary")
                  }
                  onClick={() => handleTipoClick("refaccion")}
                >
                  Refacciones
                </button>
                <button
                  type="button"
                  className={
                    "btn btn-sm " +
                    (tipo === "servicio" ? "btn-primary" : "btn-outline-primary")
                  }
                  onClick={() => handleTipoClick("servicio")}
                >
                  Servicios
                </button>
              </div>
            </div>

            <div className="card-body">
              <div className="row g-3">
                <div className="col-12">
                  <small className="text-muted">
                    Tipo actual:{" "}
                    <strong>
                      {tipo === "servicio" ? "SERVICIO" : "REFACCIÓN"}
                    </strong>
                  </small>
                </div>

                <div className="col-12">
                  <h6 className="fw-bold border-bottom pb-2 mb-0">
                    Datos internos
                  </h6>
                </div>

                <div className="col-md-4">
                  <label className="form-label">Código interno:</label>
                  <input
                    className="form-control"
                    name="numeroParte"
                    value={form.numeroParte}
                    onChange={onChange}
                  />
                </div>

                <div className="col-md-8">
                  <label className="form-label">Descripción:</label>
                  <input
                    className="form-control"
                    name="descripcion"
                    value={form.descripcion}
                    onChange={onChange}
                  />
                </div>

                {tipo === "refaccion" && (
                  <div className="col-md-4">
                    <label className="form-label">Proveedor:</label>
                    <input
                      className="form-control"
                      name="proveedor"
                      value={form.proveedor}
                      onChange={onChange}
                    />
                  </div>
                )}

                {/* ✅ grupoServicio ahora visible para servicios */}
                {tipo === "servicio" && (
                  <div className="col-md-4">
                    <label className="form-label">Grupo de servicio:</label>
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

                {tipo === "servicio" && (
                  <>
                    <div className="col-12 mt-3">
                      <h6 className="fw-bold border-bottom pb-2 mb-0">
                        Datos SAT{" "}
                        <small className="text-muted fw-normal">
                          (requerido cuando el cliente solicita factura)
                        </small>
                      </h6>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">Código SAT:</label>
                      <input
                        className="form-control"
                        name="codigoSat"
                        value={form.codigoSat}
                        onChange={onChange}
                      />
                    </div>

                    <div className="col-md-8">
                      <label className="form-label">Descripción SAT:</label>
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

              <div className="d-flex justify-content-end mt-3">
                <button
                  type="button"
                  className="btn btn-primary px-4"
                  onClick={guardar}
                  disabled={loading}
                >
                  {loading ? "Guardando..." : "Guardar"}
                </button>
              </div>

              {/* Selector + Buscar */}
              <div className="row align-items-end mt-4">
                <div className="col-md-9">
                  <label className="form-label">
                    {tipo === "servicio"
                      ? "Seleccionar Servicio:"
                      : "Seleccionar Refacción:"}
                  </label>
                  <select
                    className="form-select"
                    value={refSel}
                    onChange={(e) => setRefSel(e.target.value)}
                  >
                    <option value="">—</option>
                    {visibleOptions.map((o) => (
                      <option key={o._id} value={o._id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <button
                    className="btn btn-primary w-100 mt-3 mt-md-0"
                    onClick={buscarSeleccion}
                  >
                    Buscar
                  </button>
                </div>
              </div>
            </div>

            {/* Tabla */}
            <div className="table-responsive px-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted small">Show</span>
                  <select
                    value={pageSize}
                    className="form-select form-select-sm"
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted small">entries</span>
                </div>

                <div className="btn-group">
                  <button
                    type="button"
                    className={
                      "btn btn-sm " +
                      (tipo === "refaccion"
                        ? "btn-outline-secondary active"
                        : "btn-outline-secondary")
                    }
                    onClick={() => handleTipoClick("refaccion")}
                  >
                    Refacciones
                  </button>
                  <button
                    type="button"
                    className={
                      "btn btn-sm " +
                      (tipo === "servicio"
                        ? "btn-outline-secondary active"
                        : "btn-outline-secondary")
                    }
                    onClick={() => handleTipoClick("servicio")}
                  >
                    Servicios
                  </button>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted small">Search:</span>
                  <input
                    className="form-control form-control-sm"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>

              <table className="table table-striped table-bordered align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>ID</th>
                    <th role="button" onClick={() => changeSort("codigo")}>
                      Código {chev(sort, "codigo")}
                    </th>
                    <th>Descripción</th>
                    {tipo === "servicio" && (
                      <th role="button" onClick={() => changeSort("grupoServicio")}>
                        Grupo {chev(sort, "grupoServicio")}
                      </th>
                    )}
                    {tipo === "servicio" && <th>Código SAT</th>}
                    {tipo === "servicio" && <th>Descripción SAT</th>}
                    <th style={{ width: 50 }} className="text-center">
                      X
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tipo === "servicio" ? 7 : 4}
                        className="text-center py-4"
                      >
                        Sin registros
                      </td>
                    </tr>
                  ) : (
                    pageData.map((x) => (
                      <tr key={x._id}>
                        <td>{x.codigo || String(x._id).slice(-4)}</td>
                        <td>{x.codigo || x.numeroParte}</td>
                        <td>{x.descripcion}</td>
                        {tipo === "servicio" && (
                          <td>
                            <span className="badge bg-secondary">
                              {GRUPO_LABELS[x.grupoServicio] || x.grupoServicio || "—"}
                            </span>
                          </td>
                        )}
                        {tipo === "servicio" && (
                          <td>{x.codigoSat || "—"}</td>
                        )}
                        {tipo === "servicio" && (
                          <td>{x.descripcionSat || "—"}</td>
                        )}
                        <td className="text-center">
                          <button
                            className="btn btn-link text-danger p-0"
                            onClick={() => eliminar(x._id)}
                          >
                            X
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="d-flex align-items-center justify-content-between pb-3">
                <div className="small text-muted">
                  Página {pageSafe} de {totalPages} — {filtered.length} registros
                  {tipo === "servicio" ? " servicios" : " refacciones"}
                </div>
                <ul className="pagination pagination-sm mb-0">
                  <li className={`page-item ${pageSafe === 1 ? "disabled" : ""}`}>
                    <button
                      className="page-link"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                  </li>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <li
                      key={i}
                      className={`page-item ${pageSafe === i + 1 ? "active" : ""}`}
                    >
                      <button
                        className="page-link"
                        onClick={() => setPage(i + 1)}
                      >
                        {i + 1}
                      </button>
                    </li>
                  ))}
                  <li
                    className={`page-item ${pageSafe === totalPages ? "disabled" : ""}`}
                  >
                    <button
                      className="page-link"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function chev(sort, key) {
  if (sort.key !== key) return <span className="text-muted">▲▼</span>;
  return sort.dir === "asc" ? <span>▲</span> : <span>▼</span>;
}