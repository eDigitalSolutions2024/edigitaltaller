// src/pages/OrdenesCompraNueva.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listProveedores } from "../api/providers";
import Dropdown from "../components/Dropdown";
import { getOrdenCompraContador } from "../api/configuracion";
import {
  createOrdenCompraManual,
  getOrdenCompraPdfBlobUrl,
} from "../api/ordenesCompra";
import { getUser } from "../auth";
import usePdfModal from "../hooks/usePdfModal";

function buildDomicilio(p) {
  if (!p) return "";
  const partes = [
    [p.calle, p.numeroExterior].filter(Boolean).join(" "),
    p.numeroInterior ? `Int. ${p.numeroInterior}` : "",
    p.colonia,
    p.ciudad,
    p.estado,
    p.codigoPostal ? `C.P. ${p.codigoPostal}` : "",
  ].filter(Boolean);
  return partes.join(", ");
}

export default function OrdenesCompraNueva() {
  const navigate = useNavigate();
  const user = getUser();
  const { pdfModal, abrirPdf } = usePdfModal();

  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState("");
  const [loadingProveedores, setLoadingProveedores] = useState(false);
  const [proximoFolio, setProximoFolio] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoadingProveedores(true);
        const { data } = await listProveedores({ limit: 200, soloActivos: true });
        setProveedores(data?.data || []);
      } catch (err) {
        console.error(err);
        alert("Error al cargar el catálogo de proveedores.");
      } finally {
        setLoadingProveedores(false);
      }
    };
    cargar();

    getOrdenCompraContador()
      .then((data) => setProximoFolio(Number(data?.valor || 0) + 1))
      .catch(() => setProximoFolio(null));
  }, []);

  const proveedor = useMemo(
    () => proveedores.find((p) => p._id === proveedorId) || null,
    [proveedores, proveedorId]
  );

  const domicilio = useMemo(() => buildDomicilio(proveedor), [proveedor]);

  const fechaHoy = useMemo(() => new Date().toLocaleDateString("es-MX"), []);

  const folioPreview =
    proximoFolio != null ? `OC-${String(proximoFolio).padStart(5, "0")}` : "…";

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!proveedorId) {
      alert("Selecciona un proveedor.");
      return;
    }

    try {
      setSaving(true);
      const resp = await createOrdenCompraManual({ proveedorId });

      if (!resp?.ok) {
        throw new Error(resp?.msg || "Error al generar la orden de compra.");
      }

      const oc = resp.ordenCompra;
      alert(`Orden de compra ${oc.numero} generada correctamente.`);

      if (oc?._id) {
        const url = await getOrdenCompraPdfBlobUrl(oc._id);
        // Espera a que el usuario cierre el PDF antes de navegar: si
        // navegáramos de inmediato, se desmontaría esta página (y el modal
        // con ella) antes de que llegara a verse.
        abrirPdf(url, "orden-compra.pdf", "Orden de Compra", () => navigate("/ordenes-compra"));
      } else {
        navigate("/ordenes-compra");
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al generar la orden de compra.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-fluid">
      <div className="card shadow-sm">
        <div className="card-body" style={{ maxWidth: 640 }}>
          <h4 className="mb-1 fw-bold">Nueva orden de compra</h4>
          <p className="text-muted small mb-3">
            Esta orden se generará con el folio{" "}
            <strong>{folioPreview}</strong>. Las piezas se capturan a mano en
            el formato impreso.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label mb-1">Proveedor</label>
              <Dropdown
                className="form-select-sm"
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                disabled={loadingProveedores}
                required
              >
                <Dropdown.Option value="">
                  {loadingProveedores ? "Cargando..." : "Selecciona un proveedor"}
                </Dropdown.Option>
                {proveedores.map((p) => (
                  <Dropdown.Option key={p._id} value={p._id}>
                    {p.nombreProveedor}
                  </Dropdown.Option>
                ))}
              </Dropdown>
            </div>

            <div className="mb-3">
              <label className="form-label mb-1">Domicilio</label>
              <input
                className="form-control form-control-sm"
                value={domicilio}
                readOnly
                placeholder="Se completa al elegir un proveedor"
              />
            </div>

            <div className="mb-3">
              <label className="form-label mb-1">Fecha</label>
              <input
                className="form-control form-control-sm"
                value={fechaHoy}
                readOnly
              />
            </div>

            <div className="row g-2 mb-4">
              <div className="col-6">
                <label className="form-label mb-1">Entrega</label>
                <input
                  className="form-control form-control-sm"
                  value={user?.name || ""}
                  readOnly
                />
              </div>
              <div className="col-6">
                <label className="form-label mb-1">Recibe</label>
                <input
                  className="form-control form-control-sm"
                  value=""
                  readOnly
                  placeholder="En blanco (se firma al recibir)"
                />
              </div>
            </div>

            <div className="d-flex gap-2">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? "Generando..." : "Generar orden de compra"}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => navigate("/ordenes-compra")}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
      {pdfModal}
    </div>
  );
}
