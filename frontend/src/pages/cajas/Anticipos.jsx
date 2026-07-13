import { useState, useEffect } from 'react';
import CajaPageHeader from '../../components/cajas/CajaPageHeader';
import { getUser } from '../../auth';
import { listOrdenesServicio, getVehiculoById } from '../../api/vehiculos';
import { getUsuariosCajas } from '../../api/users';
import '../../styles/cajas.css';

// Órdenes elegibles para anticipo: desde que entran a reparación hasta que
// ya están cerradas (incluye calidad y pendiente de cierre). No incluye
// canceladas.
const ESTADOS_ANTICIPO = ['REPARACION_EN_CURSO', 'CALIDAD', 'PENDIENTE_CERRAR', 'CERRADA'];

const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta Débito', 'Tarjeta Crédito'];

const TIPOS_INGRESO = ['Remisión', 'Factura'];

function nombreCliente(cliente) {
  const c = cliente || {};
  if (c.tipoCliente === 'Empresa Gobierno') return c.gobierno?.nombreGobierno || '—';
  if (c.tipoCliente === 'Empresa Privada' || c.tipoCliente === 'Empresa Arrendadora') {
    return c.nombre || c.empresa?.razonSocial || '—';
  }
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ') || '—';
}

// Total facturable de la orden: mismo cálculo que usa el backend en reportes
// (routes/reportes.js:calcImporte) a partir de la venta al cliente.
function totalOrdenDe(vehiculo) {
  return (vehiculo.ventaCliente || []).reduce(
    (s, i) => s + (i.cant || 1) * (i.precioVenta || 0),
    0
  );
}

function mapOrden(vehiculo) {
  return {
    id: vehiculo._id,
    ordenServicio: vehiculo.ordenServicio,
    cliente: nombreCliente(vehiculo.cliente),
    vehiculo: [vehiculo.anio, vehiculo.marca, vehiculo.modelo, vehiculo.color]
      .filter(Boolean)
      .join(' '),
    placas: vehiculo.placas || '—',
    totalOrden: totalOrdenDe(vehiculo),
    // No existe todavía un módulo de anticipos/pagos en el backend que
    // rastree lo abonado a una orden; hasta que exista, se asume 0.
    totalAbonado: 0,
  };
}

/** Devuelve las órdenes de servicio desde reparación en curso hasta cerradas. */
async function fetchOrdenesDisponibles() {
  const respuestas = await Promise.all(
    ESTADOS_ANTICIPO.map((estado) => listOrdenesServicio({ estado, limit: 200 }))
  );
  const vehiculos = respuestas.flatMap((r) => r.data?.data || []);
  vehiculos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return vehiculos.map(mapOrden);
}

/**
 * Devuelve los datos de una orden para poblar el formulario.
 * @param {string} orderId
 */
async function loadOrderData(orderId) {
  const { data } = await getVehiculoById(orderId);
  if (!data?.vehiculo) throw new Error('Orden no encontrada');
  return mapOrden(data.vehiculo);
}

/**
 * Registra el anticipo (con los datos del pago) en el backend.
 * REEMPLAZAR con:
 *   await http.post('/cajas/anticipos', payload);
 * Pendiente: aún no existe el módulo de cajas/anticipos en el backend.
 *
 * @param {object} payload
 */
async function registrarAnticipo(payload) { // eslint-disable-line no-unused-vars
  await new Promise((r) => setTimeout(r, 600));
  // El backend devolverá el folio generado; por ahora simulamos éxito.
}

// ─────────────────────────────────────────────────────────────────────────────

const BREADCRUMB = [
  { label: 'Inicio', to: '/dashboard' },
  { label: 'Cajas', to: '/cajas/anticipos' },
  { label: 'Anticipo' },
];

function fmtMXN(n) {
  try {
    return Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  } catch {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }
}

export default function Anticipos() {
  const user = getUser();

  // ── Lista de órdenes disponibles en el selector ──
  const [ordenes, setOrdenes] = useState([]);
  const [cargandoOrdenes, setCargandoOrdenes] = useState(true);

  // ── Personal de cajas disponible para "Recibe" ──
  const [usuariosCajas, setUsuariosCajas] = useState([]);

  // ── Orden seleccionada y sus datos ──
  const [ordenId, setOrdenId] = useState('');
  const [ordenData, setOrdenData] = useState(null); // { ...campos, saldo }
  const [cargandoOrden, setCargandoOrden] = useState(false);

  // ── Importe a abonar (paso 1) ──
  const [importe, setImporte] = useState('');
  const [errorImporte, setErrorImporte] = useState('');

  // ── Paso 2: Información del pago (solo visible tras "Generar") ──
  const [generado, setGenerado] = useState(false);
  const [cantidadPesos, setCantidadPesos] = useState('');
  const [cantidadDolares, setCantidadDolares] = useState('');
  const [tipoCambio, setTipoCambio] = useState('17.50');
  const [formaPago, setFormaPago] = useState('');
  const [recibe, setRecibe] = useState('');
  const [tipoIngreso, setTipoIngreso] = useState('');

  // ── Feedback de la operación ──
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');
  const [errorGeneral, setErrorGeneral] = useState('');

  // Cargar la lista de órdenes al montar
  useEffect(() => {
    fetchOrdenesDisponibles()
      .then(setOrdenes)
      .catch(() => {
        setOrdenes([]);
        setErrorGeneral('No se pudieron cargar las órdenes en reparación. Intenta de nuevo.');
      })
      .finally(() => setCargandoOrdenes(false));
  }, []);

  // Cargar el personal de cajas para el select "Recibe"
  useEffect(() => {
    getUsuariosCajas()
      .then((data) => setUsuariosCajas(Array.isArray(data) ? data : []))
      .catch(() => setUsuariosCajas([]));
  }, []);

  // ── Handlers ──

  const handleOrdenChange = async (e) => {
    const id = e.target.value;
    setOrdenId(id);
    setOrdenData(null);
    setImporte('');
    setErrorImporte('');
    setGenerado(false);
    setMensajeExito('');
    setErrorGeneral('');

    if (!id) return;

    try {
      setCargandoOrden(true);
      const data = await loadOrderData(id);
      const saldo = data.totalOrden - data.totalAbonado;
      setOrdenData({ ...data, saldo });
      setImporte(String(saldo));
    } catch {
      setErrorGeneral('No se pudo obtener la información de la orden. Intenta de nuevo.');
    } finally {
      setCargandoOrden(false);
    }
  };

  const handleImporteChange = (e) => {
    const val = e.target.value;
    setImporte(val);
    setErrorImporte('');
    setMensajeExito('');

    if (val === '' || val === '0') {
      setErrorImporte('El importe debe ser mayor a $0.');
      return;
    }
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) {
      setErrorImporte('Ingresa un importe válido mayor a $0.');
      return;
    }
    if (ordenData && num > ordenData.saldo) {
      setErrorImporte(
        `El importe no puede superar el saldo pendiente de ${fmtMXN(ordenData.saldo)}.`
      );
    }
  };

  const handleGenerar = () => {
    if (!puedeGenerar) return;
    setCantidadPesos(importe);
    setCantidadDolares('');
    setTipoCambio((prev) => prev || '17.50');
    setFormaPago('');
    setRecibe('');
    setTipoIngreso('');
    setMensajeExito('');
    setErrorGeneral('');
    setGenerado(true);
  };

  const handleEditarSeleccion = () => {
    setGenerado(false);
    setMensajeExito('');
  };

  const handleGuardarPago = async (e) => {
    e.preventDefault();
    if (!puedeGuardarPago) return;

    try {
      setGuardando(true);
      setErrorGeneral('');
      await registrarAnticipo({
        ordenId: ordenData.id,
        importeAbonar: importeNum,
        cantidadPesos: cantidadPesosNum,
        cantidadDolares: cantidadDolaresNum,
        tipoCambio: tipoCambioNum,
        dolaresAPesos,
        formaPago,
        importeTotal,
        recibe,
        tipoIngreso,
        usuario: user?.name || '',
      });
      setMensajeExito(
        `Anticipo de ${fmtMXN(importeTotal)} registrado correctamente en ${ordenData.ordenServicio}.`
      );
      // Resetear formulario completo
      setOrdenId('');
      setOrdenData(null);
      setImporte('');
      setGenerado(false);
      setCantidadPesos('');
      setCantidadDolares('');
      setTipoCambio('17.50');
      setFormaPago('');
      setRecibe('');
      setTipoIngreso('');
    } catch {
      setErrorGeneral('Error al registrar el anticipo. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  // ── Computed: paso 1 ──
  const importeNum = parseFloat(importe) || 0;
  const puedeGenerar =
    ordenData !== null &&
    importeNum > 0 &&
    importeNum <= (ordenData?.saldo ?? 0) &&
    !errorImporte;

  // ── Computed: paso 2 (Información del pago) ──
  const cantidadPesosNum = parseFloat(cantidadPesos) || 0;
  const cantidadDolaresNum = parseFloat(cantidadDolares) || 0;
  const tipoCambioNum = parseFloat(tipoCambio) || 0;
  const dolaresAPesos = cantidadDolaresNum > 0 ? cantidadDolaresNum * tipoCambioNum : 0;
  const importeTotal = cantidadPesosNum + dolaresAPesos;

  const hayNegativos = cantidadPesosNum < 0 || cantidadDolaresNum < 0 || tipoCambioNum < 0;
  const excedeImporteAbonar = importeTotal > importeNum + 0.001;

  const puedeGuardarPago =
    generado &&
    ordenData !== null &&
    importeNum > 0 &&
    importeTotal > 0 &&
    !hayNegativos &&
    !excedeImporteAbonar &&
    !!formaPago &&
    !!recibe &&
    !!tipoIngreso &&
    !guardando;

  return (
    <div className="container-fluid py-3">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-9 col-xl-7">

          <CajaPageHeader
            breadcrumb={BREADCRUMB}
            title="ANTICIPO"
            subtitle="Registrar anticipo a una Orden de Servicio activa"
          />

          <div className="card shadow-sm border-0">

            {/* Cabecera de la card */}
            <div className="card-header bg-white border-0 py-3 d-flex align-items-center justify-content-between">
              <div>
                <span className="fw-bold text-dark">Nueva transacción</span>
                <span className="text-muted small ms-2">— Anticipo a Orden de Servicio</span>
              </div>
              {user?.name && (
                <span className="badge bg-secondary fw-normal small">{user.name}</span>
              )}
            </div>

            <div className="card-body px-4 py-4">
              <form onSubmit={handleGuardarPago} noValidate>

                {/* ── 1. Selector de Orden de Servicio ── */}
                <div className="mb-4">
                  <label className="caja-form-label" htmlFor="sel-orden">
                    Orden de Servicio <span className="text-danger">*</span>
                  </label>
                  <select
                    id="sel-orden"
                    className="form-select"
                    value={ordenId}
                    onChange={handleOrdenChange}
                    disabled={cargandoOrdenes || guardando || generado}
                  >
                    <option value="">
                      {cargandoOrdenes
                        ? 'Cargando órdenes…'
                        : '— Seleccionar Orden de Servicio —'}
                    </option>
                    {ordenes.map((o) => {
                      const saldo = o.totalOrden - o.totalAbonado;
                      return (
                        <option key={o.id} value={o.id}>
                          {o.ordenServicio} · {o.cliente} · Saldo: {fmtMXN(saldo)}
                        </option>
                      );
                    })}
                  </select>
                  <div className="form-text">
                    Se muestran órdenes en reparación, calidad, pendientes de cierre o cerradas.
                  </div>
                </div>

                {/* ── Spinner de carga de orden ── */}
                {cargandoOrden && (
                  <div className="d-flex align-items-center gap-2 text-muted small py-2 mb-3">
                    <div className="spinner-border spinner-border-sm" role="status">
                      <span className="visually-hidden">Cargando…</span>
                    </div>
                    Obteniendo datos de la orden…
                  </div>
                )}

                {/* ── 2. Detalle de la Orden seleccionada ── */}
                {ordenData && !cargandoOrden && (
                  <>
                    <hr className="my-1" />
                    <p className="caja-seccion-label mt-3 mb-3">
                      Información de la Orden
                    </p>

                    {/* Cliente y Vehículo */}
                    <div className="row g-3 mb-3">
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label">Cliente</label>
                        <input
                          type="text"
                          className="form-control caja-readonly"
                          value={ordenData.cliente}
                          readOnly
                          tabIndex={-1}
                        />
                      </div>
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label">Vehículo</label>
                        <input
                          type="text"
                          className="form-control caja-readonly"
                          value={`${ordenData.vehiculo} · ${ordenData.placas}`}
                          readOnly
                          tabIndex={-1}
                        />
                      </div>
                    </div>

                    {/* Resumen financiero — tres tarjetas */}
                    <div className="caja-resumen-financiero mb-4">
                      <div className="caja-resumen-item">
                        <span className="caja-resumen-label">Total de la Orden</span>
                        <span className="caja-resumen-valor">
                          {fmtMXN(ordenData.totalOrden)}
                        </span>
                      </div>

                      <div className="caja-resumen-item">
                        <span className="caja-resumen-label">Total Abonado</span>
                        <span className="caja-resumen-valor caja-resumen-abonado">
                          {fmtMXN(ordenData.totalAbonado)}
                        </span>
                      </div>

                      <div className="caja-resumen-item caja-resumen-saldo">
                        <span className="caja-resumen-label">Saldo Pendiente</span>
                        <span className="caja-resumen-valor caja-resumen-saldo-valor">
                          {fmtMXN(ordenData.saldo)}
                        </span>
                      </div>
                    </div>

                    <hr className="my-1" />
                    <p className="caja-seccion-label mt-3 mb-3">
                      Importe del Anticipo
                    </p>

                    {/* ── 3. Importe a Abonar ── */}
                    <div className="mb-4">
                      <label className="caja-form-label" htmlFor="importe">
                        Importe a Abonar <span className="text-danger">*</span>
                      </label>
                      <div className="input-group">
                        <span className="input-group-text fw-bold bg-light">$</span>
                        <input
                          id="importe"
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={ordenData.saldo}
                          className={`form-control caja-importe-input${errorImporte ? ' is-invalid' : ''}`}
                          value={importe}
                          onChange={handleImporteChange}
                          placeholder="0.00"
                          disabled={guardando || generado}
                        />
                        {errorImporte && (
                          <div className="invalid-feedback d-block">
                            {errorImporte}
                          </div>
                        )}
                      </div>
                      <div className="form-text mt-1">
                        Máximo permitido: <strong>{fmtMXN(ordenData.saldo)}</strong>.
                        Puede registrar un anticipo parcial.
                      </div>
                    </div>

                    {/* ── Botón "Generar" (solo antes de pasar a captura de pago) ── */}
                    {!generado && (
                      <div className="d-flex justify-content-end pt-1 mb-2">
                        <button
                          type="button"
                          className="btn btn-primary px-4"
                          disabled={!puedeGenerar}
                          onClick={handleGenerar}
                        >
                          Generar
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* ── 4. Información del pago (paso 2) ── */}
                {generado && ordenData && (
                  <>
                    <hr className="my-1" />
                    <div className="d-flex align-items-center justify-content-between mt-3 mb-3">
                      <p className="caja-seccion-label mb-0">
                        Información del Pago
                      </p>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0"
                        onClick={handleEditarSeleccion}
                        disabled={guardando}
                      >
                        ‹ Editar importe / orden
                      </button>
                    </div>

                    <div className="row g-3 mb-3">
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label" htmlFor="cantidad-pesos">
                          Cantidad en Pesos
                        </label>
                        <div className="input-group">
                          <span className="input-group-text bg-light">$</span>
                          <input
                            id="cantidad-pesos"
                            type="number"
                            min="0"
                            step="0.01"
                            className="form-control"
                            value={cantidadPesos}
                            onChange={(e) => setCantidadPesos(e.target.value)}
                            placeholder="0.00"
                            disabled={guardando}
                          />
                        </div>
                      </div>
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label" htmlFor="cantidad-dolares">
                          Cantidad en Dólares <span className="text-muted fw-normal">(opcional)</span>
                        </label>
                        <div className="input-group">
                          <span className="input-group-text bg-light">USD</span>
                          <input
                            id="cantidad-dolares"
                            type="number"
                            min="0"
                            step="0.01"
                            className="form-control"
                            value={cantidadDolares}
                            onChange={(e) => setCantidadDolares(e.target.value)}
                            placeholder="0.00"
                            disabled={guardando}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="row g-3 mb-3">
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label" htmlFor="tipo-cambio">
                          Tipo de Cambio
                        </label>
                        <input
                          id="tipo-cambio"
                          type="number"
                          min="0"
                          step="0.0001"
                          className="form-control"
                          value={tipoCambio}
                          onChange={(e) => setTipoCambio(e.target.value)}
                          disabled={guardando}
                        />
                      </div>
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label">Dólares a Pesos</label>
                        <input
                          type="text"
                          className="form-control caja-readonly"
                          value={fmtMXN(dolaresAPesos)}
                          readOnly
                          tabIndex={-1}
                        />
                      </div>
                    </div>

                    <div className="row g-3 mb-3">
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label" htmlFor="forma-pago">
                          Forma de Pago <span className="text-danger">*</span>
                        </label>
                        <select
                          id="forma-pago"
                          className="form-select"
                          value={formaPago}
                          onChange={(e) => setFormaPago(e.target.value)}
                          disabled={guardando}
                        >
                          <option value="">— Seleccionar —</option>
                          {FORMAS_PAGO.map((fp) => (
                            <option key={fp} value={fp}>{fp}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label">Importe Total</label>
                        <input
                          type="text"
                          className={`form-control caja-readonly${excedeImporteAbonar ? ' is-invalid' : ''}`}
                          value={fmtMXN(importeTotal)}
                          readOnly
                          tabIndex={-1}
                        />
                        {excedeImporteAbonar && (
                          <div className="invalid-feedback d-block">
                            El importe total no puede superar el importe a abonar de {fmtMXN(importeNum)}.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="row g-3 mb-4">
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label" htmlFor="recibe">
                          Recibe <span className="text-danger">*</span>
                        </label>
                        <select
                          id="recibe"
                          className="form-select"
                          value={recibe}
                          onChange={(e) => setRecibe(e.target.value)}
                          disabled={guardando}
                        >
                          <option value="">
                            {usuariosCajas.length === 0 ? 'Sin personal de cajas dado de alta' : '— Seleccionar usuario —'}
                          </option>
                          {usuariosCajas.map((u) => (
                            <option key={u._id} value={u._id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-12 col-sm-6">
                        <label className="caja-form-label" htmlFor="caja-destino">
                          Ingreso a Reporte / Caja <span className="text-danger">*</span>
                        </label>
                        <select
                          id="caja-destino"
                          className="form-select"
                          value={tipoIngreso}
                          onChange={(e) => setTipoIngreso(e.target.value)}
                          disabled={guardando}
                        >
                          <option value="">— Seleccionar —</option>
                          {TIPOS_INGRESO.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Mensajes de resultado ── */}
                {mensajeExito && (
                  <div className="alert alert-success py-2 small mb-3" role="alert">
                    ✓ {mensajeExito}
                  </div>
                )}
                {errorGeneral && (
                  <div className="alert alert-danger py-2 small mb-3" role="alert">
                    {errorGeneral}
                  </div>
                )}

                {/* ── Botón "Guardar Pago" (solo en paso 2) ── */}
                {generado && (
                  <div className="d-flex justify-content-end pt-1">
                    <button
                      type="submit"
                      className="btn btn-primary px-4"
                      disabled={!puedeGuardarPago}
                    >
                      {guardando ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                            aria-hidden="true"
                          />
                          Guardando…
                        </>
                      ) : (
                        'Guardar Pago'
                      )}
                    </button>
                  </div>
                )}

              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
