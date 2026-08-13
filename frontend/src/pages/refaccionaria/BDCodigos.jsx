// src/pages/refaccionaria/BDCodigos.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import Dropdown from "../../components/Dropdown";
import ModalAltaProveedor from "./components/ModalAltaProveedor";
import { getUnidadesMedida } from "../../api/configuracion";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";
const PAGE_SIZES = [10, 25, 50, 100];

const FORM_VACÍO = () => ({
  _id: "",
  tipo: "refaccion",
  numeroParte: "",
  descripcion: "",
  proveedor: "",
  marca: "",
  unidad: "",
  precioUnitario: "",
});

function mapItem(x) {
  return {
    _id: x._id || x.id,
    codigo: x.codigo || "",
    tipo: x.tipo || "refaccion",
    numeroParte: x.numeroParte || "",
    proveedor: x.proveedor || "",
    marca: x.marca || "",
    descripcion: x.descripcion || "",
    unidad: x.unidad || "",
    precioUnitario: x.precioUnitario ?? "",
  };
}

export default function BDCodigos() {
  const formRef = useRef(null);
  const [form, setForm] = useState(FORM_VACÍO());
  const [options, setOptions] = useState([]);
  const [refSel, setRefSel] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "codigo", dir: "asc" });
  const [proveedores, setProveedores] = useState([]);
  const [showModalProveedor, setShowModalProveedor] = useState(false);
  const [unidades, setUnidades] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [o, t] = await Promise.all([
          fetch(`${API}/codigos/options`, { credentials: "include" })
            .then((r) => r.json())
            .catch(() => ({})),
          fetch(`${API}/codigos?limit=1000`, { credentials: "include" })
            .then((r) => r.json())
            .catch(() => ({})),
        ]);
        setOptions(o?.data || []);
        setItems((t?.data || t || []).map(mapItem));
      } catch (e) {
        console.error(e);
      }
    })();

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

    getUnidadesMedida()
      .then((data) => setUnidades((data || []).filter((u) => u.activo)))
      .catch(() => setUnidades([]));

    return () => { abort = true; };
  }, []);

  const visibleOptions = useMemo(() => {
    return (options || []).filter((o) => (o.tipo || "refaccion") !== "servicio");
  }, [options]);

  const filtered = useMemo(() => {
    const q = (query || "").toLowerCase().trim();
    let arr = items.filter((x) => (x.tipo || "refaccion") !== "servicio");
    if (q) {
      arr = arr.filter(
        (x) =>
          (x.codigo || "").toLowerCase().includes(q) ||
          (x.numeroParte || "").toLowerCase().includes(q) ||
          (x.descripcion || "").toLowerCase().includes(q) ||
          (x.proveedor || "").toLowerCase().includes(q)
      );
    }
    arr.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const av = String(a[sort.key] || "").toLowerCase();
      const bv = String(b[sort.key] || "").toLowerCase();
      return av.localeCompare(bv) * dir;
    });
    return arr;
  }, [items, query, sort]);

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

  const handleProveedorCreado = (nuevoProveedor) => {
    setProveedores((prev) => [...prev, nuevoProveedor]);
    setForm((f) => ({ ...f, proveedor: nuevoProveedor.nombreProveedor || nuevoProveedor.nombre || "" }));
    setShowModalProveedor(false);
  };

  function editarItem(x) {
    setForm({
      _id: x._id,
      tipo: "refaccion",
      numeroParte: x.numeroParte || "",
      descripcion: x.descripcion || "",
      proveedor: x.proveedor || "",
      marca: x.marca || "",
      unidad: x.unidad || "",
      precioUnitario: x.precioUnitario ?? "",
    });
    setRefSel("");
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function guardar() {
    try {
      setLoading(true);
      const payload = {
        tipo: "refaccion",
        codigo: (form.numeroParte || "").trim(),
        numeroParte: (form.numeroParte || "").trim(),
        descripcion: form.descripcion.trim(),
        proveedor: form.proveedor.trim(),
        marca: form.marca.trim(),
        unidad: form.unidad,
        precioUnitario: form.precioUnitario !== "" ? Number(form.precioUnitario) : null,
      };

      if (!payload.numeroParte)
        throw new Error("El código interno es obligatorio.");
      if (!payload.descripcion)
        throw new Error("La descripción es obligatoria.");
      if (!payload.proveedor)
        throw new Error("El proveedor es obligatorio.");

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
    setItems((t?.data || t || []).map(mapItem));
  }

  async function recargarOptions() {
    const o = await fetch(`${API}/codigos/options`, { credentials: "include" })
      .then((r) => r.json())
      .catch(() => ({}));
    setOptions(o?.data || []);
  }

  function limpiar() {
    setForm(FORM_VACÍO());
    setRefSel("");
  }

  async function buscarSeleccion() {
    if (!refSel) return;
    const r = await fetch(`${API}/codigos/${refSel}`, {
      credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j?.message || "No encontrado");
    editarItem(j.data);
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

  const esEdicion = !!form._id;

  return (
    <div className="container-fluid py-3">
      <div className="row justify-content-center">
        <div className="col-12 col-xxl-10">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 d-flex justify-content-between align-items-center">
              <h2 className="h4 mb-0">
                {esEdicion ? "EDITAR CÓDIGO" : "ALTA DE CÓDIGOS"}
              </h2>
            </div>

            <div className="card-body" ref={formRef}>
              <div className="row g-3">
                {esEdicion && (
                  <div className="col-12">
                    <small className="text-muted">
                      <span className="badge bg-warning text-dark">
                        Editando: {form.numeroParte}
                      </span>
                    </small>
                  </div>
                )}

                <div className="col-12">
                  <h6 className="fw-bold border-bottom pb-2 mb-0">
                    Datos internos
                  </h6>
                </div>

                <div className="col-md-4">
                  <label className="form-label">
                    Código interno: <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control"
                    name="numeroParte"
                    value={form.numeroParte}
                    onChange={onChange}
                  />
                </div>

                <div className="col-md-8">
                  <label className="form-label">
                    Descripción: <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control"
                    name="descripcion"
                    value={form.descripcion}
                    onChange={onChange}
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">
                    Proveedor: <span className="text-danger">*</span>
                  </label>
                  <Dropdown
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
                    <Dropdown.Option value="">— Selecciona —</Dropdown.Option>
                    {proveedores.map((p) => (
                      <Dropdown.Option key={p._id} value={p.nombreProveedor || p.nombre || p.aliasProveedor}>
                        {p.nombreProveedor || p.nombre || p.aliasProveedor || p.rfc}
                      </Dropdown.Option>
                    ))}
                    <Dropdown.Option value="__nuevo__">➕ Dar de alta nuevo proveedor...</Dropdown.Option>
                  </Dropdown>
                </div>

                <div className="col-md-4">
                  <label className="form-label">Marca:</label>
                  <input
                    className="form-control"
                    name="marca"
                    value={form.marca}
                    onChange={onChange}
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">Unidad:</label>
                  <Dropdown
                    className="form-select"
                    name="unidad"
                    value={form.unidad}
                    onChange={onChange}
                  >
                    <Dropdown.Option value="">— Selecciona —</Dropdown.Option>
                    {unidades.map((u) => (
                      <Dropdown.Option key={u._id} value={u.nombre}>
                        {u.nombre}
                      </Dropdown.Option>
                    ))}
                  </Dropdown>
                </div>

                <div className="col-md-4">
                  <label className="form-label">Precio unitario:</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    name="precioUnitario"
                    value={form.precioUnitario}
                    onChange={onChange}
                  />
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-3">
                {esEdicion && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={limpiar}
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary px-4"
                  onClick={guardar}
                  disabled={loading}
                >
                  {loading ? "Guardando..." : esEdicion ? "Actualizar" : "Guardar"}
                </button>
              </div>

              {/* Selector + Buscar */}
              <div className="row align-items-end mt-4">
                <div className="col-md-9">
                  <label className="form-label">Seleccionar Refacción:</label>
                  <Dropdown
                    className="form-select"
                    value={refSel}
                    onChange={(e) => setRefSel(e.target.value)}
                  >
                    <Dropdown.Option value="">—</Dropdown.Option>
                    {visibleOptions.map((o) => (
                      <Dropdown.Option key={o._id} value={o._id}>
                        {o.label}
                      </Dropdown.Option>
                    ))}
                  </Dropdown>
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
                  <Dropdown
                    value={pageSize}
                    className="form-select-sm"
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZES.map((n) => (
                      <Dropdown.Option key={n} value={n}>
                        {n}
                      </Dropdown.Option>
                    ))}
                  </Dropdown>
                  <span className="text-muted small">entries</span>
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
                    <th>Marca</th>
                    <th>Unidad</th>
                    <th>Precio</th>
                    <th style={{ width: 80 }} className="text-center">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4">
                        Sin registros
                      </td>
                    </tr>
                  ) : (
                    pageData.map((x) => (
                      <tr key={x._id}>
                        <td>{x.codigo || String(x._id).slice(-4)}</td>
                        <td>{x.codigo || x.numeroParte}</td>
                        <td>{x.descripcion}</td>
                        <td>{x.marca || "—"}</td>
                        <td>{x.unidad || "—"}</td>
                        <td>
                          {x.precioUnitario != null && x.precioUnitario !== ""
                            ? `$${Number(x.precioUnitario).toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="text-center">
                          <button
                            className="btn btn-link text-primary p-0 me-2"
                            title="Editar"
                            onClick={() => editarItem(x)}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn btn-link text-danger p-0"
                            title="Eliminar"
                            onClick={() => eliminar(x._id)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="d-flex align-items-center justify-content-between pb-3">
                <div className="small text-muted">
                  Página {pageSafe} de {totalPages} — {filtered.length} registros refacciones
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

      {showModalProveedor && (
        <ModalAltaProveedor
          onProveedorCreado={handleProveedorCreado}
          onClose={() => setShowModalProveedor(false)}
        />
      )}
    </div>
  );
}

function chev(sort, key) {
  if (sort.key !== key) return <span className="text-muted">▲▼</span>;
  return sort.dir === "asc" ? <span>▲</span> : <span>▼</span>;
}
