import { useEffect, useState } from "react";
import { getUnidadesMedida } from "../../../api/configuracion";
import ModalInventarioAlmacen from "./ModalInventarioAlmacen";

// Mismo formulario que "Cotizar opción" en SolicitudTallerDetalle.jsx, para que
// el refaccionario capture el detalle de una refacción que vino de un Servicio
// de catálogo (brincó la cotización de refaccionaria) antes de poder surtirla.
const emptyDetalle = () => ({
  unidad: "",
  tipo: "",
  marca: "",
  proveedor: "",
  codigo: "",
  precioUnitario: "",
  moneda: "MN",
  tipoCambio: "",
  tiempoEntrega: "",
  core: "",
  precioCore: "",
  observaciones: "",
});

export default function ModalCotizarSurtido({ refaccionNombre, cant, vehiculo, prefill, onGuardar, onClose }) {
  const [unidades, setUnidades] = useState([]);
  const [detalle, setDetalle] = useState({ ...emptyDetalle(), ...(prefill || {}) });
  const [errores, setErrores] = useState([]);
  const [modalInventarioOpen, setModalInventarioOpen] = useState(false);

  useEffect(() => {
    getUnidadesMedida()
      .then((data) => setUnidades((data || []).filter((u) => u.activo)))
      .catch(() => setUnidades([]));
  }, []);

  const cambiar = (field, value) => {
    setDetalle((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "core" && value !== "SI") next.precioCore = "";
      if (field === "moneda" && value !== "USD") next.tipoCambio = "";
      return next;
    });
    setErrores((prev) => prev.filter((f) => f !== field));
  };

  const seleccionarDeAlmacen = (item) => {
    const tienePrecio = item.precioUnitario != null && item.precioUnitario !== "";
    setDetalle((prev) => ({
      ...prev,
      codigo: item.codigo || "",
      unidad: item.unidad || prev.unidad || "",
      marca: item.marca || prev.marca || "",
      precioUnitario: tienePrecio ? String(item.precioUnitario) : prev.precioUnitario || "",
    }));
    setModalInventarioOpen(false);
  };

  const handleGuardar = () => {
    const precio = Number(detalle.precioUnitario || 0);
    const errs = [];
    if (!detalle.marca?.trim()) errs.push("marca");
    if (!detalle.proveedor?.trim()) errs.push("proveedor");
    if (precio <= 0) errs.push("precioUnitario");
    if (detalle.moneda === "USD" && Number(detalle.tipoCambio || 0) <= 0) errs.push("tipoCambio");

    if (errs.length > 0) {
      setErrores(errs);
      return;
    }

    onGuardar({
      unidad: detalle.unidad || "",
      tipo: detalle.tipo || "",
      marca: detalle.marca.trim(),
      proveedor: detalle.proveedor.trim(),
      codigo: detalle.codigo || "",
      precioCompra: precio,
      moneda: detalle.moneda || "MN",
      tipoCambio: detalle.moneda === "USD" ? Number(detalle.tipoCambio || 0) : 0,
      tiempoEntrega: detalle.tiempoEntrega || "",
      core: detalle.core || "",
      precioCore: detalle.core === "SI" ? Number(detalle.precioCore || 0) : 0,
      observInt: detalle.observaciones || "",
    });
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1040 }}
      />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 1050, width: "90%", maxWidth: 720, maxHeight: "85vh",
          background: "white", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <span className="fw-bold">Completar detalle para surtir</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>

        <div className="p-3" style={{ overflowY: "auto" }}>
          {vehiculo && (
            <div className="border rounded p-2 mb-3 bg-light">
              <div className="row g-2">
                <div className="col-6 col-md-3">
                  <label className="form-label form-label-sm fw-semibold mb-1">Orden</label>
                  <input className="form-control form-control-sm" value={vehiculo.ordenServicio || ""} disabled />
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label form-label-sm fw-semibold mb-1">Cliente</label>
                  <input className="form-control form-control-sm" value={vehiculo.cliente || ""} disabled />
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label form-label-sm fw-semibold mb-1">Vehículo</label>
                  <input
                    className="form-control form-control-sm"
                    value={[vehiculo.marca, vehiculo.modelo, vehiculo.anio].filter(Boolean).join(" ") || "Sin vehículo"}
                    disabled
                  />
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label form-label-sm fw-semibold mb-1">Placas</label>
                  <input className="form-control form-control-sm" value={vehiculo.placas || ""} disabled />
                </div>
              </div>
              <div className="row g-2 mt-1">
                <div className="col-6 col-md-2">
                  <label className="form-label form-label-sm fw-semibold mb-1">Color</label>
                  <input className="form-control form-control-sm" value={vehiculo.color || ""} disabled />
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label form-label-sm fw-semibold mb-1">Serie</label>
                  <input className="form-control form-control-sm" value={vehiculo.serie || ""} disabled />
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label form-label-sm fw-semibold mb-1">KMS/Millas</label>
                  <input className="form-control form-control-sm" value={vehiculo.kmsMillas || ""} disabled />
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label form-label-sm fw-semibold mb-1">Motor</label>
                  <input className="form-control form-control-sm" value={vehiculo.motor || ""} disabled />
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label form-label-sm fw-semibold mb-1">No. Económico</label>
                  <input className="form-control form-control-sm" value={vehiculo.numeroEconomico || ""} disabled />
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label form-label-sm fw-semibold mb-1">Tracción</label>
                  <input className="form-control form-control-sm" value={vehiculo.traccion || ""} disabled />
                </div>
              </div>
            </div>
          )}

          <p className="fw-semibold mb-3 border-bottom pb-2">
            {refaccionNombre}
            <span className="text-muted ms-2 small">(Cant: {cant})</span>
          </p>

          <div className="row g-2">
            <div className="col-6 col-md-4">
              <label className="form-label form-label-sm mb-1">Unidad</label>
              <select
                className="form-select form-select-sm"
                value={detalle.unidad}
                onChange={(e) => cambiar("unidad", e.target.value)}
                disabled={unidades.length === 0}
              >
                <option value="">—</option>
                {unidades.map((u) => (
                  <option key={u._id} value={u.nombre}>{u.nombre}</option>
                ))}
              </select>
            </div>

            <div className="col-6 col-md-4">
              <label className="form-label form-label-sm mb-1">Tipo</label>
              <select
                className="form-select form-select-sm"
                value={detalle.tipo}
                onChange={(e) => cambiar("tipo", e.target.value)}
              >
                <option value="">— Selec. —</option>
                <option value="Original">Original</option>
                <option value="Usado">Usado</option>
                <option value="Generico">Genérico</option>
                <option value="Alterna">Alterna</option>
              </select>
            </div>

            <div className="col-6 col-md-4">
              <label className="form-label form-label-sm mb-1">Marca <span className="text-danger">*</span></label>
              <input
                className={`form-control form-control-sm ${errores.includes("marca") ? "is-invalid" : ""}`}
                placeholder="Ej. Bosch"
                value={detalle.marca}
                onChange={(e) => cambiar("marca", e.target.value)}
              />
            </div>

            <div className="col-6 col-md-4">
              <label className="form-label form-label-sm mb-1">Proveedor <span className="text-danger">*</span></label>
              {detalle.proveedor === "Almacén" ? (
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-success">Almacén</span>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    title="Cambiar proveedor"
                    onClick={() => cambiar("proveedor", "")}
                  >✕</button>
                </div>
              ) : (
                <div className="d-flex align-items-center gap-1">
                  <input
                    className={`form-control form-control-sm ${errores.includes("proveedor") ? "is-invalid" : ""}`}
                    placeholder="Ej. Distribuidora XYZ"
                    value={detalle.proveedor}
                    onChange={(e) => cambiar("proveedor", e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-success text-nowrap px-3"
                    title="Usar almacén como proveedor"
                    onClick={() => cambiar("proveedor", "Almacén")}
                  >Almacén</button>
                </div>
              )}
            </div>

            <div className="col-6 col-md-4">
              <label className="form-label form-label-sm mb-1">Código</label>
              {detalle.proveedor === "Almacén" ? (
                <div className="d-flex gap-1">
                  <input
                    className="form-control form-control-sm"
                    value={detalle.codigo}
                    readOnly
                    placeholder="Seleccionar del inventario..."
                    style={{ backgroundColor: "#f8f9fa" }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm text-nowrap"
                    onClick={() => setModalInventarioOpen(true)}
                  >Buscar</button>
                </div>
              ) : (
                <input
                  className="form-control form-control-sm"
                  placeholder="Ej. AZ-BJ-2345"
                  value={detalle.codigo}
                  onChange={(e) => cambiar("codigo", e.target.value)}
                />
              )}
            </div>
            <div className="col-6 col-md-4"></div>

            <div className="col-6 col-md-2">
              <label className="form-label form-label-sm mb-1">Precio unit. <span className="text-danger">*</span></label>
              <input
                type="number"
                className={`form-control form-control-sm ${errores.includes("precioUnitario") ? "is-invalid" : ""}`}
                placeholder="$0.00"
                value={detalle.precioUnitario}
                onChange={(e) => cambiar("precioUnitario", e.target.value)}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label form-label-sm mb-1">Moneda</label>
              <select
                className="form-select form-select-sm"
                value={detalle.moneda}
                onChange={(e) => cambiar("moneda", e.target.value)}
              >
                <option value="MN">MN</option>
                <option value="USD">USD</option>
              </select>
            </div>

            {detalle.moneda === "USD" && (
              <div className="col-6 col-md-2">
                <label className="form-label form-label-sm mb-1">Tipo cambio</label>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  className={`form-control form-control-sm ${errores.includes("tipoCambio") ? "is-invalid" : ""}`}
                  placeholder="Ej. 17.25"
                  value={detalle.tipoCambio}
                  onChange={(e) => cambiar("tipoCambio", e.target.value)}
                />
              </div>
            )}

            <div className="col-6 col-md-3">
              <label className="form-label form-label-sm mb-1">Tiempo entrega</label>
              <input
                className="form-control form-control-sm"
                placeholder="Ej. 2 días"
                value={detalle.tiempoEntrega}
                onChange={(e) => cambiar("tiempoEntrega", e.target.value)}
              />
            </div>

            <div className="col-4 col-md-2">
              <label className="form-label form-label-sm mb-1">Core</label>
              <select
                className="form-select form-select-sm"
                value={detalle.core}
                onChange={(e) => cambiar("core", e.target.value)}
              >
                <option value="">—</option>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
                <option value="N/A">N/A</option>
              </select>
            </div>

            {detalle.core === "SI" && (
              <div className="col-4 col-md-2">
                <label className="form-label form-label-sm mb-1">Precio core</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  placeholder="$0.00"
                  value={detalle.precioCore}
                  onChange={(e) => cambiar("precioCore", e.target.value)}
                />
              </div>
            )}

            <div className="col-12 col-md-5">
              <label className="form-label form-label-sm mb-1">Observaciones</label>
              <input
                className="form-control form-control-sm"
                placeholder="Notas adicionales..."
                value={detalle.observaciones}
                onChange={(e) => cambiar("observaciones", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="p-3 border-top d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary px-4" onClick={handleGuardar}>
            Guardar detalle
          </button>
        </div>
      </div>

      {modalInventarioOpen && (
        <ModalInventarioAlmacen
          onSelect={seleccionarDeAlmacen}
          onClose={() => setModalInventarioOpen(false)}
        />
      )}
    </>
  );
}
