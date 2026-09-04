import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listCustomers } from "../../api/customers";
import {
  registrarAnticipo,
  getHistorialAnticipos,
  cancelarAnticipo,
  getAnticipoReciboPdfUrl,
  getClientesConSaldo,
} from "../../api/anticipos";
import { getUser } from "../../auth";
import { formatFecha } from "../../utils/fechas";
import usePdfModal from "../../hooks/usePdfModal";
import CajaModalAnticipoDeposito from "./components/CajaModalAnticipoDeposito";
import CajaModalCancelarAnticipo from "./components/CajaModalCancelarAnticipo";

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function nombreCliente(c) {
  if (!c) return "";
  return c.tipoCliente === "Particular"
    ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ")
    : c.gobierno?.nombreGobierno || c.empresa?.razonSocial || c.nombre || "";
}

const TIPO_LABELS = {
  DEPOSITO: "Depósito",
  USO: "Uso en orden",
  REEMBOLSO_USO: "Reembolso",
};

// Pantalla de Cajas para captar anticipos de clientes (saldo a favor) y
// consultar/cancelar sus movimientos. Vive en Cajas (no en Clientes) porque
// el rol 'cajas' solo tiene acceso a los módulos ['cajas','vehiculo'] (ver
// frontend/src/utils/roles.js) y esto es, en esencia, una operación de caja.
export default function CajasAnticipos() {
  const [searchParams] = useSearchParams();
  const esAdmin = getUser()?.role === "admin";
  const { pdfModal, abrirPdf } = usePdfModal();

  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);

  const [cliente, setCliente] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [error, setError] = useState("");

  // Lista organizada de clientes con saldo disponible (>0), visible desde
  // que se entra a la pantalla, sin tener que buscar cliente por cliente.
  const [clientesConSaldo, setClientesConSaldo] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);

  const [showModalDeposito, setShowModalDeposito] = useState(false);
  const [movimientoACancelar, setMovimientoACancelar] = useState(null);

  // Búsqueda de cliente con un pequeño debounce, mismo patrón de lista
  // desplegable (list-group posicionado) que usa NuevaFactura.jsx.
  useEffect(() => {
    if (!q.trim()) {
      setResultados([]);
      return;
    }
    let activo = true;
    setBuscando(true);
    const t = setTimeout(() => {
      listCustomers({ q: q.trim(), limit: 15 })
        .then((res) => {
          if (activo) setResultados(res.data?.data || []);
        })
        .catch(() => {
          if (activo) setResultados([]);
        })
        .finally(() => {
          if (activo) setBuscando(false);
        });
    }, 300);
    return () => { activo = false; clearTimeout(t); };
  }, [q]);

  const cargarLista = async () => {
    try {
      setCargandoLista(true);
      const res = await getClientesConSaldo();
      setClientesConSaldo(res.data?.data || []);
    } catch (err) {
      // No se bloquea la pantalla por esto: la búsqueda manual sigue funcionando.
      setClientesConSaldo([]);
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarLista();
  }, []);

  const cargarHistorial = async (clienteId) => {
    try {
      setCargandoHistorial(true);
      setError("");
      const res = await getHistorialAnticipos(clienteId);
      setCliente(res.data.cliente);
      setMovimientos(res.data.movimientos || []);
    } catch (err) {
      setError("Error al cargar el historial de anticipos.");
    } finally {
      setCargandoHistorial(false);
    }
  };

  // Si se llega desde el perfil de un cliente (AltaCliente.jsx) con
  // ?clienteId=..., precarga ese cliente directamente.
  useEffect(() => {
    const clienteId = searchParams.get("clienteId");
    if (clienteId) cargarHistorial(clienteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seleccionarCliente = (c) => {
    setQ("");
    setResultados([]);
    setMostrarResultados(false);
    cargarHistorial(c._id);
  };

  const volverALista = () => {
    setCliente(null);
    setMovimientos([]);
    setError("");
  };

  const handleRegistrarDeposito = async (payload) => {
    const res = await registrarAnticipo(payload);
    await Promise.all([cargarHistorial(payload.clienteId), cargarLista()]);
    setShowModalDeposito(false);
    const movimiento = res.data.movimiento;
    abrirPdf(getAnticipoReciboPdfUrl(movimiento._id), "recibo-provisional.pdf", "Recibo Provisional");
  };

  const handleConfirmarCancelar = async (motivo) => {
    await cancelarAnticipo(movimientoACancelar._id, { motivo });
    await Promise.all([cargarHistorial(cliente._id), cargarLista()]);
    setMovimientoACancelar(null);
  };

  return (
    <div>
      <h5 className="fw-semibold mb-3">Anticipos de Clientes</h5>

      <div className="position-relative mb-3" style={{ maxWidth: 480 }}>
        <input
          className="form-control"
          placeholder="Buscar cliente por nombre, razón social o RFC…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setMostrarResultados(true); }}
          onFocus={() => resultados.length && setMostrarResultados(true)}
        />
        {mostrarResultados && q.trim() && (
          <div className="list-group position-absolute w-100" style={{ zIndex: 20, maxHeight: 300, overflow: "auto" }}>
            {buscando && <div className="list-group-item">Buscando…</div>}
            {!buscando && resultados.length === 0 && (
              <div className="list-group-item">Sin resultados</div>
            )}
            {!buscando && resultados.map((c) => (
              <button
                type="button"
                key={c._id}
                className="list-group-item list-group-item-action"
                onClick={() => seleccionarCliente(c)}
              >
                <div className="fw-bold">{nombreCliente(c)}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{c.rfc || c.tipoCliente}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {cargandoHistorial && <p className="text-muted">Cargando…</p>}

      {!cliente && !cargandoHistorial && (
        <>
          <h6 className="fw-semibold mb-2">Clientes con Saldo Disponible</h6>
          {cargandoLista ? (
            <p className="text-muted">Cargando…</p>
          ) : clientesConSaldo.length === 0 ? (
            <div className="alert alert-info py-2">
              Ningún cliente tiene saldo disponible actualmente. Busca un cliente arriba para registrarle un anticipo.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-hover align-middle">
                <thead className="table-light text-center">
                  <tr>
                    <th>Cliente</th>
                    <th>Teléfono</th>
                    <th className="text-end">Saldo Disponible</th>
                    <th>Último Movimiento</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clientesConSaldo.map((c) => {
                    const tel = (c.celulares?.[0] || c.telefonos?.[0]);
                    return (
                      <tr key={c._id} style={{ cursor: "pointer" }} onClick={() => cargarHistorial(c._id)}>
                        <td className="fw-semibold">{nombreCliente(c)}</td>
                        <td className="text-center">{tel ? [tel.lada, tel.numero].filter(Boolean).join(" ") : "—"}</td>
                        <td className="text-end fw-bold text-success">{formatMoney(c.saldoAFavor)}</td>
                        <td className="text-center">{formatFecha(c.updatedAt) || "—"}</td>
                        <td className="text-center">
                          <button type="button" className="btn btn-sm btn-outline-primary" onClick={(e) => { e.stopPropagation(); cargarHistorial(c._id); }}>
                            Ver / Usar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {cliente && !cargandoHistorial && (
        <>
          <button type="button" className="btn btn-sm btn-outline-secondary mb-3" onClick={volverALista}>
            ← Volver a la lista
          </button>

          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 border rounded p-3">
            <div>
              <div className="fw-bold fs-5">{nombreCliente(cliente)}</div>
              <div className="text-muted">
                Saldo a favor: <strong className="text-success">{formatMoney(cliente.saldoAFavor)}</strong>
              </div>
            </div>
            <button className="btn btn-success" onClick={() => setShowModalDeposito(true)}>
              Registrar Anticipo
            </button>
          </div>

          <h6 className="fw-semibold mb-2">Historial de Movimientos</h6>
          <div className="table-responsive">
            <table className="table table-sm table-bordered align-middle">
              <thead className="table-light text-center">
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Monto</th>
                  <th>Folio / Orden</th>
                  <th>Registrado por</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted">
                      Este cliente no tiene movimientos de anticipos.
                    </td>
                  </tr>
                )}
                {movimientos.map((m) => (
                  <tr key={m._id} className={m.cancelado ? "table-secondary text-decoration-line-through" : ""}>
                    <td className="text-center">{formatFecha(m.fecha)}</td>
                    <td className="text-center">
                      {TIPO_LABELS[m.tipo] || m.tipo}
                      {m.cancelado && (
                        <span className="badge bg-danger ms-1" title={m.motivoCancelacion || "Cancelado"}>
                          Cancelado
                        </span>
                      )}
                    </td>
                    <td className={`text-end fw-bold ${m.tipo === "USO" ? "text-danger" : "text-success"}`}>
                      {m.tipo === "USO" ? "-" : "+"}{formatMoney(m.monto)}
                    </td>
                    <td className="text-center">
                      {m.tipo === "DEPOSITO" ? `Provisional N°${m.folioRecibo ?? "-"}` : (m.ordenAplicada?.ordenServicio || "-")}
                    </td>
                    <td>{m.registradoPor}</td>
                    <td className="text-center">
                      <div className="d-flex gap-1 justify-content-center">
                        {m.tipo === "DEPOSITO" && (
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            title="Imprimir Recibo Provisional"
                            onClick={() => abrirPdf(getAnticipoReciboPdfUrl(m._id), "recibo-provisional.pdf", "Recibo Provisional")}
                          >
                            Imprimir
                          </button>
                        )}
                        {esAdmin && m.tipo === "DEPOSITO" && !m.cancelado && (
                          <button
                            className="btn btn-outline-dark btn-sm"
                            title="Cancelar este depósito"
                            onClick={() => setMovimientoACancelar(m)}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <CajaModalAnticipoDeposito
        show={showModalDeposito}
        cliente={cliente}
        onClose={() => setShowModalDeposito(false)}
        onSubmit={handleRegistrarDeposito}
      />
      <CajaModalCancelarAnticipo
        show={!!movimientoACancelar}
        movimiento={movimientoACancelar}
        onClose={() => setMovimientoACancelar(null)}
        onConfirm={handleConfirmarCancelar}
      />
      {pdfModal}
    </div>
  );
}
