import React, { useEffect, useRef, useState } from 'react';
import { getUser } from '../../auth';
import { listOrdenesServicio } from '../../api/vehiculos';
import {
  ESTATUS_VALE_OPCIONES,
  getSiguienteNumeroVale,
  getSiguienteDig,
  buscarOrdenParaVale,
  createVale,
  getVales,
  openValePdf,
} from '../../api/vales';

const VACIO = {
  noOrden: '',
  quienEntrega: '',
  estatus: 'Contado',
  observaciones: '',
};

function fmtFechaHora(d) {
  const pad = (n) => String(n).padStart(2, '0');
  let horas = d.getHours();
  const ampm = horas >= 12 ? 'p. m.' : 'a. m.';
  horas = horas % 12 || 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(horas)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
}

function nombreCliente(c) {
  if (!c) return '';
  if (c.tipoCliente === 'Empresa') return c.empresa?.razonSocial || c.empresa?.contacto?.nombre || '';
  if (c.tipoCliente === 'Gobierno') return c.gobierno?.nombreGobierno || '';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

function snapshotFromOrden(o) {
  return {
    vehiculo: o._id,
    asesor: o.creadoPor || '',
    nombreCliente: nombreCliente(o.cliente),
    marca: o.marca || '',
    tipo: o.modelo || '',
    modelo: o.anio || '',
    color: o.color || '',
    serie: o.serie || '',
    placas: o.placas || '',
    kms: o.kmsMillas || '',
  };
}

export default function ValeSalidaForm() {
  const user = getUser();

  const [form, setForm] = useState(VACIO);
  const [noVale, setNoVale] = useState('');
  const [dig, setDig] = useState(0);
  const [autoNumero, setAutoNumero] = useState(false);

  const [sugerencias, setSugerencias] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [buscandoOrden, setBuscandoOrden] = useState(false);
  const debounceRef = useRef(null);

  const [snapshot, setSnapshot] = useState(null);
  const [ahora, setAhora] = useState(new Date());
  const [guardando, setGuardando] = useState(false);
  const [valeGuardadoId, setValeGuardadoId] = useState(null);
  const [mensaje, setMensaje] = useState(null); // { tipo, texto }

  const [historial, setHistorial] = useState(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const cargarHistorial = () => {
    setCargandoHistorial(true);
    getVales({ limit: 50 })
      .then((res) => setHistorial(res.data?.data || []))
      .catch(() => {})
      .finally(() => setCargandoHistorial(false));
  };

  useEffect(() => {
    cargarHistorial();
  }, []);

  const resetForm = () => {
    setForm(VACIO);
    setNoVale('');
    setDig(0);
    setAutoNumero(false);
    setSnapshot(null);
    setValeGuardadoId(null);
    setMensaje(null);
    setSugerencias([]);
    setMostrarSugerencias(false);
  };

  const handleChange = (campo) => (e) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }));
  };

  // ── No. Orden: autocompletado con búsqueda en el servidor ──
  const handleNoOrdenChange = (e) => {
    const valor = e.target.value;
    setForm((f) => ({ ...f, noOrden: valor }));
    setSnapshot(null);
    setValeGuardadoId(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (valor.trim().length < 2) {
      setSugerencias([]);
      setMostrarSugerencias(false);
      return;
    }
    setBuscandoOrden(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await listOrdenesServicio({ searchOs: valor.trim(), limit: 8 });
        setSugerencias(res.data?.data || []);
        setMostrarSugerencias(true);
      } catch {
        setSugerencias([]);
      } finally {
        setBuscandoOrden(false);
      }
    }, 300);
  };

  const seleccionarOrden = (o) => {
    setForm((f) => ({ ...f, noOrden: o.ordenServicio }));
    setSnapshot(snapshotFromOrden(o));
    setSugerencias([]);
    setMostrarSugerencias(false);
  };

  // Si el usuario escribe el número completo a mano y no elige una sugerencia,
  // intenta igual encontrar la orden exacta al salir del campo.
  const handleNoOrdenBlur = async () => {
    setTimeout(() => setMostrarSugerencias(false), 150); // deja tiempo al click de una sugerencia
    const noOrden = form.noOrden.trim();
    if (!noOrden || snapshot) return;
    try {
      const res = await buscarOrdenParaVale(noOrden);
      if (res.data.encontrado) {
        setSnapshot(res.data.data);
      }
    } catch {
      // silencioso: no es obligatorio encontrar coincidencia
    }
  };

  // ── No. Vale ──
  const handleDobleClickNoVale = async () => {
    try {
      const res = await getSiguienteNumeroVale();
      setNoVale(String(res.data.numero));
      setDig(0);
      setAutoNumero(true);
      setValeGuardadoId(null);
    } catch {
      setMensaje({ tipo: 'danger', texto: 'No se pudo consultar el siguiente número de vale.' });
    }
  };

  const handleNoValeChange = (e) => {
    setNoVale(e.target.value.replace(/[^0-9]/g, ''));
    setAutoNumero(false); // el usuario lo está capturando/editando manualmente
    setValeGuardadoId(null);
  };

  const handleNoValeBlur = async () => {
    if (!noVale || autoNumero) return;
    try {
      const res = await getSiguienteDig(noVale);
      setDig(res.data.dig);
    } catch {
      // silencioso: el servidor recalcula el Dig correcto al guardar
    }
  };

  const construirPayload = () => ({
    noOrden: form.noOrden.trim(),
    noVale: Number(noVale),
    autoNumero,
    quienEntrega: form.quienEntrega.trim(),
    cajero: user?.name || user?.username || '',
    estatus: form.estatus,
    observaciones: form.observaciones.trim(),
    vehiculo: snapshot?.vehiculo || null,
  });

  const validar = () => {
    if (!form.noOrden.trim()) return 'Captura el número de orden.';
    if (!noVale) return 'Captura o genera el número de vale.';
    return null;
  };

  const handleGuardar = async () => {
    const err = validar();
    if (err) {
      setMensaje({ tipo: 'danger', texto: err });
      return null;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await createVale(construirPayload());
      const guardado = res.data.data;
      setValeGuardadoId(guardado._id);
      setNoVale(String(guardado.noVale));
      setDig(guardado.dig);
      setMensaje({ tipo: 'success', texto: `Vale ${guardado.noVale}-${guardado.dig} guardado correctamente.` });
      cargarHistorial();
      return guardado._id;
    } catch {
      setMensaje({ tipo: 'danger', texto: 'Error al guardar el vale.' });
      return null;
    } finally {
      setGuardando(false);
    }
  };

  const handleImprimir = () => {
    if (!valeGuardadoId) {
      setMensaje({ tipo: 'warning', texto: 'Guarda el vale antes de imprimir.' });
      return;
    }
    openValePdf(valeGuardadoId);
  };

  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">🎫 Vales de Salida</h2>

      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <h5 className="fw-bold mb-3">Nuevo Vale</h5>

          {mensaje && (
            <div className={`alert alert-${mensaje.tipo} py-2`}>{mensaje.texto}</div>
          )}

          <div className="row g-3">
            <div className="col-md-4 position-relative">
              <label className="form-label small fw-semibold">No. Orden</label>
              <input
                type="text"
                className="form-control"
                value={form.noOrden}
                onChange={handleNoOrdenChange}
                onBlur={handleNoOrdenBlur}
                onFocus={() => sugerencias.length > 0 && setMostrarSugerencias(true)}
                placeholder="Buscar orden…"
                autoComplete="off"
              />
              {buscandoOrden && <div className="form-text">Buscando…</div>}
              {mostrarSugerencias && sugerencias.length > 0 && (
                <div className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 20 }}>
                  {sugerencias.map((o) => (
                    <button
                      type="button"
                      key={o._id}
                      className="list-group-item list-group-item-action py-1 px-2 small"
                      onMouseDown={() => seleccionarOrden(o)}
                    >
                      <strong>{o.ordenServicio}</strong> — {nombreCliente(o.cliente) || 'Sin cliente'} · {o.marca || ''} {o.modelo || ''}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-semibold">Fecha</label>
              <input type="text" className="form-control" value={fmtFechaHora(ahora)} readOnly data-no-uppercase />
            </div>

            <div className="col-md-2">
              <label className="form-label small fw-semibold">No. Vale</label>
              <input
                type="text"
                className="form-control"
                value={noVale}
                onChange={handleNoValeChange}
                onBlur={handleNoValeBlur}
                onDoubleClick={handleDobleClickNoVale}
                title="Doble click para generar el siguiente número automáticamente"
                data-no-uppercase
              />
            </div>

            <div className="col-md-2">
              <label className="form-label small fw-semibold">Dig</label>
              <input type="text" className="form-control" value={dig} readOnly data-no-uppercase />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-semibold">Quien entrega</label>
              <input
                type="text"
                className="form-control"
                value={form.quienEntrega}
                onChange={handleChange('quienEntrega')}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-semibold">Cajero(a)</label>
              <input type="text" className="form-control" value={user?.name || ''} readOnly data-no-uppercase />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-semibold">Estatus</label>
              <select className="form-select" value={form.estatus} onChange={handleChange('estatus')}>
                {ESTATUS_VALE_OPCIONES.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>

            <div className="col-12">
              <label className="form-label small fw-semibold">Observaciones</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.observaciones}
                onChange={handleChange('observaciones')}
              />
            </div>
          </div>

          {snapshot && (
            <div className="alert alert-info mt-3 py-2 small mb-0">
              <strong>Datos encontrados:</strong> {snapshot.nombreCliente || '—'} · {snapshot.marca || '—'} {snapshot.tipo || ''} · Placas: {snapshot.placas || '—'} · Asesor: {snapshot.asesor || '—'}
            </div>
          )}

          <div className="d-flex gap-2 mt-4">
            <button type="button" className="btn btn-primary" onClick={handleGuardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn btn-outline-danger" onClick={handleImprimir}>
              Imprimir
            </button>
            {valeGuardadoId && (
              <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
                Nuevo Vale
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="fw-bold mb-0">Historial de Vales</h5>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={cargarHistorial} disabled={cargandoHistorial}>
              {cargandoHistorial ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {!historial || historial.length === 0 ? (
            <div className="alert alert-info py-2 mb-0">
              {cargandoHistorial ? 'Cargando…' : 'Aún no se han emitido vales.'}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-hover align-middle">
                <thead className="table-secondary">
                  <tr>
                    <th>No Orden</th>
                    <th>Fecha</th>
                    <th>No. Vale</th>
                    <th>Dig</th>
                    <th>Quien Entrega</th>
                    <th>Cajera(o)</th>
                    <th>Estatus</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((v) => (
                    <tr key={v._id}>
                      <td>{v.noOrden}</td>
                      <td>{new Date(v.fecha).toLocaleString('es-MX')}</td>
                      <td>{v.noVale}</td>
                      <td>{v.dig}</td>
                      <td>{v.quienEntrega || '—'}</td>
                      <td>{v.cajero || '—'}</td>
                      <td>{v.estatus}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => openValePdf(v._id)}
                        >
                          Impresión
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
