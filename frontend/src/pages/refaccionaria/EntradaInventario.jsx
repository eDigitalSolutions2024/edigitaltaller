// frontend/src/pages/refaccionaria/EntradaInventario.jsx
import { useEffect, useRef, useState } from "react";
import TablaCapturaEntrada from "./components/TablaCapturaEntrada";
import ModalAltaProveedor from "./components/ModalAltaProveedor";
import ModalAltaCodigo from "./components/ModalAltaCodigo";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

export default function EntradaInventario() {
  const [loading, setLoading] = useState(false);
  const [proveedores, setProveedores] = useState([]);

  const [codigos, setCodigos] = useState([]);
  const [showModalCodigo, setShowModalCodigo] = useState(false);

  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoTipo, setFotoTipo] = useState(null);
  const [zoomAbierto, setZoomAbierto] = useState(false);

  // 👇 se llena tras crear la entrada; controla mostrar la tabla
  const [entradaId, setEntradaId] = useState(null);
  const [entradaInfo, setEntradaInfo] = useState(null);
  const tablaRef = useRef(null);

  const [showModalProveedor, setShowModalProveedor] = useState(false);

  const [form, setForm] = useState({
    comprobante: "Factura",
    numero: "",
    moneda: "MXN",
    formaPago: "Crédito",
    proveedorId: "",
    fecha: new Date().toISOString().split("T")[0],
    foto: null,
  });

  // Carga proveedores reales
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const r = await fetch(`${API}/proveedores?limit=200&soloActivos=true`, {
          credentials: "include",
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json?.message || "Error al listar proveedores");
        if (!abort) setProveedores(json?.data || []);
      } catch (err) {
        console.error(err);
        if (!abort) setProveedores([]);
      }
    })();

    fetch(`${API}/codigos`, { credentials: "include" }).then((r) => r.json()).then((j) => setCodigos(j?.data || j || [])).catch(() => setCodigos([]));
    return () => { abort = true; };
 
  }, []);

  const onChange = (e) => {
    const { name, value, files } = e.target;
    if (name === "proveedorId" && value === "__nuevo__") {
      setShowModalProveedor(true);
      return; // no actualiza el form con "__nuevo__"
    }
    if (files) setForm((f) => ({ ...f, [name]: files[0] || null }));
    else setForm((f) => ({ ...f, [name]: value }));

    if (files) {
      const archivo = files[0] || null;
      setForm((f) => ({ ...f, [name]: archivo }));
      if (archivo) {
        setFotoTipo(archivo.type);
        setFotoPreview(URL.createObjectURL(archivo));
      } else {
        setFotoPreview(null);
        setFotoTipo(null);
      }
    }

  };


const handleProveedorCreado = (nuevoProveedor) => {
  setProveedores((prev) => [...prev, nuevoProveedor]); // agrega a la lista
  setForm((f) => ({ ...f, proveedorId: nuevoProveedor._id })); // lo selecciona automáticamente
  setShowModalProveedor(false);
};  

const handleCodigoCreado = (nuevoCodigo) => {
  setCodigos((prev) => [...prev, nuevoCodigo]);
  setForm((f) => ({ ...f, codigoId: nuevoCodigo._id, codigoLabel: nuevoCodigo.numeroParte }));
  setShowModalCodigo(false);
};

const onSubmit = async (e) => {
  e.preventDefault();

  if (!form.proveedorId) return alert("Selecciona un proveedor.");
  if (!form.fecha) return alert("Selecciona la fecha de la factura.");
  if (!form.numero.trim()) return alert("Ingresa el número de factura o remisión.");

  // 👇 Enviamos JSON al endpoint del backend que ya tienes
  const payload = {
    tipoComprobante: form.comprobante,
    numero: form.numero.trim(),
    moneda: form.moneda,
    formaPago: form.formaPago,
    proveedorId: form.proveedorId,
    fechaFactura: form.fecha + "T12:00:00.000Z",
    // fotoFactura: null // (si quieres subir archivo, ver opción B)
  };

  try {
    setLoading(true);
    const r = await fetch(`${API}/entradas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json?.message || "Error al crear la entrada");

    // nuestro backend devuelve { success:true, entradaId: _id } (ajústalo a _id si prefieres)
    const id = json?.entradaId || json?._id || json?.data?._id;
    if (!id) throw new Error("No se recibió folio/ID de la entrada.");

    setEntradaId(id);
    const prov = proveedores.find((p) => p._id === form.proveedorId);
    setEntradaInfo({
      id,
      proveedorNombre: prov?.nombreProveedor || prov?.nombre || "",
      numero: form.numero,
      fecha: form.fecha,
      moneda: form.moneda,
      comprobante: form.comprobante,
    });

    setTimeout(() => tablaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  } catch (err) {
    console.error(err);
    alert(err.message || "Error al guardar la entrada.");
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="container-fluid py-3">
      <div className="row justify-content-center">
        <div className="col-12 col-xxl-10">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0">
              <h2 className="h4 text-center mb-0">ALTA DE MATERIAL EN INVENTARIO VARIABLE</h2>
            </div>

            <div className="card-body">
              {/* Formulario inicial */}
              <form onSubmit={onSubmit} encType="multipart/form-data">
                {/* Fila 1 */}
                <div className="row g-3 align-items-end">
                  <div className="col-12 col-md-6">
                    <label className="form-label">Tipo de Comprobante</label>
                    <select className="form-select" name="comprobante" value={form.comprobante} onChange={onChange}>
                      <option>Factura</option>
                      <option>Remisión</option>
                      <option>Nota</option>
                      <option>Ticket</option>
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Número de Factura y/o Remisión</label>
                    <input
                      type="text"
                      className="form-control"
                      name="numero"
                      value={form.numero}
                      onChange={onChange}
                      placeholder="Folio del documento"
                    />
                  </div>
                </div>

                {/* Fila 2 */}
                <div className="row g-3 align-items-end mt-1">
                  <div className="col-12 col-md-6">
                    <label className="form-label">Moneda</label>
                    <select className="form-select" name="moneda" value={form.moneda} onChange={onChange}>
                      <option value="MXN">MXN - Peso mexicano</option>
                      <option value="USD">USD - Dólar estadounidense</option>
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Forma de Pago</label>
                    <select className="form-select" name="formaPago" value={form.formaPago} onChange={onChange}>
                      <option>Crédito</option>
                      <option>Contado</option>
                      <option>Transferencia</option>
                      <option>Efectivo</option>
                      <option>Tarjeta</option>
                    </select>
                  </div>
                </div>

                {/* Fila 3 */}
                <div className="row g-3 align-items-end mt-1">
                  <div className="col-12 col-md-6">
                    <label className="form-label">Proveedor</label>
                    <select className="form-select" name="proveedorId" value={form.proveedorId} onChange={onChange}>
                      <option value="">— Selecciona —</option>
                      {proveedores.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.nombreProveedor || p.nombre || p.aliasProveedor || p.rfc}
                        </option>
                      ))}
                      <option value="__nuevo__">➕ Dar de alta nuevo proveedor...</option>
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Fecha Factura</label>
                    <input type="date" className="form-control" name="fecha" value={form.fecha} onChange={onChange} />
                  </div>
                </div>

                {/* Fila 4 */}
                <div className="row g-3 align-items-end mt-1">
                  <div className="col-12 col-md-6">
                    <label className="form-label">Foto Factura</label>
                    <input
                      type="file"
                      className="form-control"
                      name="foto"
                      accept="image/*,application/pdf"
                      onChange={onChange}
                    />
                    <div className="form-text">Acepta imagen o PDF (≤ 5MB).</div>
                  </div>
                </div>

                {fotoPreview && (
                  <div className="mt-2 border rounded p-2" style={{ maxWidth: 400 }}>
                    {fotoTipo === "application/pdf" ? (
                      <iframe
                        src={fotoPreview}
                        title="Vista previa PDF"
                        width="100%"
                        height="300px"
                        style={{ border: "none" }}
                      />
                    ) : (
                      <>
                        {/* Imagen con cursor de zoom */}
                        <img
                          src={fotoPreview}
                          alt="Vista previa"
                          onClick={() => setZoomAbierto(true)}
                          style={{
                            width: "100%",
                            maxHeight: 300,
                            objectFit: "contain",
                            cursor: "zoom-in",
                          }}
                        />
                        <div className="text-center">
                          <small className="text-muted">🔍 Clic para ampliar</small>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Modal de zoom */}
                {zoomAbierto && (
                  <div
                    onClick={() => setZoomAbierto(false)}
                    style={{
                      position: "fixed",
                      inset: 0,
                      backgroundColor: "rgba(0,0,0,0.85)",
                      zIndex: 2000,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "zoom-out",
                    }}
                  >
                    <img
                      src={fotoPreview}
                      alt="Zoom"
                      style={{
                        maxWidth: "90vw",
                        maxHeight: "90vh",
                        objectFit: "contain",
                        borderRadius: 8,
                        boxShadow: "0 0 40px rgba(0,0,0,0.6)",
                      }}
                    />
                    {/* Botón cerrar */}
                    <button
                      onClick={() => setZoomAbierto(false)}
                      style={{
                        position: "absolute",
                        top: 16,
                        right: 16,
                        background: "white",
                        border: "none",
                        borderRadius: "50%",
                        width: 36,
                        height: 36,
                        fontSize: 18,
                        cursor: "pointer",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}

                <div className="d-flex justify-content-center mt-4">
                  <button type="submit" className="btn btn-primary px-4" disabled={loading}>
                    {loading ? "Guardando..." : "Comenzar Captura"}
                  </button>
                </div>
              </form>
            </div>

            <div className="card-footer bg-white border-0 text-center small text-muted">
              Completa los datos del documento de compra para iniciar la captura de partidas.
            </div>
          </div>

          {/* 👇 SOLO aparece cuando ya hay entradaId */}
          {entradaId && (
            <div ref={tablaRef} className="card shadow-sm border-0 mt-3">
              <div className="card-header bg-white border-0">
                <h3 className="h5 mb-0">
                  Captura de partidas — Entrada <span className="font-monospace">#{entradaId}</span>
                </h3>
                {entradaInfo?.proveedorNombre && (
                  <div className="small text-muted">
                    Proveedor: <strong>{entradaInfo.proveedorNombre}</strong> · Doc:{" "}
                    <strong>{entradaInfo.numero}</strong> · Fecha: <strong>{entradaInfo.fecha}</strong> · Moneda:{" "}
                    <strong>{entradaInfo.moneda}</strong>
                  </div>
                )}
              </div>
              <div className="card-body">
                <TablaCapturaEntrada entradaId={entradaId} info={entradaInfo} />
              </div>
            </div>
          )}
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
