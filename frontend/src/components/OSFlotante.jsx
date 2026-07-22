import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMisOrdenes } from '../api/vehiculos';
import { getUser } from '../auth';
import '../styles/OSFlotante.css';

const ESTADO_LABEL = {
  INGRESO: 'Ingreso',
  PENDIENTE_REFACCIONARIA: 'Refaccionaria',
  PENDIENTE_AUTORIZACION_CLIENTE: 'Aut. Cliente',
  PENDIENTE_SURTIR: 'Por surtir',
  PENDIENTE_CIERRE: 'Pdte. cierre',
  REPARACION_EN_CURSO: 'En reparación',
  CALIDAD: 'Calidad',
  PENDIENTE_CERRAR: 'Por cerrar',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

const ESTADO_COLOR = {
  INGRESO: '#6c757d',
  PENDIENTE_REFACCIONARIA: '#0d6efd',
  PENDIENTE_AUTORIZACION_CLIENTE: '#fd7e14',
  PENDIENTE_SURTIR: '#6610f2',
  PENDIENTE_CIERRE: '#dc3545',
  REPARACION_EN_CURSO: '#198754',
  CALIDAD: '#20c997',
  PENDIENTE_CERRAR: '#ffc107',
  CERRADA: '#343a40',
  CANCELADA: '#dc3545',
};

function tiempoTranscurrido(fechaCreacion) {
  const diff = Date.now() - new Date(fechaCreacion).getTime();
  const minutos = Math.floor(diff / 60000);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);

  if (dias > 0) return `${dias}d ${horas % 24}h`;
  if (horas > 0) return `${horas}h ${minutos % 60}m`;
  return `${minutos}m`;
}

function nombreCliente(orden) {
  const c = orden.cliente || {};
  if (c.gobierno?.nombreGobierno) return c.gobierno.nombreGobierno;
  const partes = [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean);
  return partes.join(' ') || '—';
}

export default function OSFlotante() {
  const user = getUser();
  const esAsesor = user?.role === 'asesor_servicio';
  const miNombre = user?.name || user?.username || '';
  const navigate = useNavigate();

  const [ordenes, setOrdenes] = useState([]);
  const [minimizado, setMinimizado] = useState(false);
  const [tick, setTick] = useState(0);

  // Posición inicial: esquina superior derecha
  const [pos, setPos] = useState({ x: window.innerWidth - 300, y: 20 });
  const dragging = useRef(false);
  const hasDragged = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const widgetRef = useRef(null);
  const intervalRef = useRef(null);

  const cargar = async () => {
    try {
      const { data } = await getMisOrdenes();
      if (data?.ok) setOrdenes(data.data);
    } catch {
      // silencioso
    }
  };

  useEffect(() => {
    if (!esAsesor) return;
    cargar();
    intervalRef.current = setInterval(cargar, 30000);
    return () => clearInterval(intervalRef.current);
  }, [esAsesor]);

  // Refresca al volver a la pestaña/ventana para mostrar el estado actualizado
  useEffect(() => {
    if (!esAsesor) return;
    const onVisible = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [esAsesor]);

  useEffect(() => {
    if (!esAsesor) return;
    const onNuevaOrden = () => cargar();
    window.addEventListener('orden-creada', onNuevaOrden);
    return () => window.removeEventListener('orden-creada', onNuevaOrden);
  }, [esAsesor]);

  useEffect(() => {
    if (!esAsesor) return;
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, [esAsesor]);

  // ── Drag handlers ──────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    if (e.target.closest('.os-flotante__toggle')) return;
    dragging.current = true;
    hasDragged.current = false;
    offset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      hasDragged.current = true;
      const newX = e.clientX - offset.current.x;
      const newY = e.clientY - offset.current.y;
      const maxX = window.innerWidth - (widgetRef.current?.offsetWidth || 280);
      const maxY = window.innerHeight - (widgetRef.current?.offsetHeight || 50);
      setPos({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };
    const onMouseUp = () => { dragging.current = false; };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  if (!esAsesor) return null;

  const grupoNombre = ordenes.find(os => os.grupoId?.nombre)?.grupoId?.nombre || '';

  return (
    <div
      ref={widgetRef}
      className="os-flotante"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="os-flotante__header"
        onMouseDown={onMouseDown}
        onClick={() => { if (!hasDragged.current) setMinimizado(m => !m); }}
      >
        <span className="os-flotante__titulo">
          ⠿ {grupoNombre ? `OS · ${grupoNombre}` : 'Mis OS'}
          <span className="os-flotante__badge">{ordenes.length}</span>
        </span>
        <button
          className="os-flotante__toggle"
          title={minimizado ? 'Expandir' : 'Minimizar'}
          onClick={(e) => { e.stopPropagation(); setMinimizado(m => !m); }}
        >
          {minimizado ? '▲' : '▼'}
        </button>
      </div>

      {!minimizado && (
        <div className="os-flotante__body">
          {ordenes.length === 0 ? (
            <p className="os-flotante__vacio">Sin órdenes activas</p>
          ) : (
            <ul className="os-flotante__lista">
              {ordenes.map(os => (
                <li
                  key={os._id}
                  className="os-flotante__item os-flotante__item--clickable"
                  onClick={() => navigate(`/vehiculo/orden/${os._id}`)}
                >
                  <div className="os-flotante__item-top">
                    <span className="os-flotante__num">{os.ordenServicio}</span>
                    <span
                      className="os-flotante__estado"
                      style={{ backgroundColor: ESTADO_COLOR[os.estadoOrden] || '#6c757d' }}
                    >
                      {ESTADO_LABEL[os.estadoOrden] || os.estadoOrden}
                    </span>
                  </div>
                  {os.creadoPor && os.creadoPor !== miNombre && (
                    <div className="os-flotante__asesor">👤 {os.creadoPor}</div>
                  )}
                  <div className="os-flotante__cliente">{nombreCliente(os)}</div>
                  <div className="os-flotante__vehiculo">
                    {[os.marca, os.modelo, os.anio].filter(Boolean).join(' ')}
                    {os.color && <span className="os-flotante__color"> · {os.color}</span>}
                  </div>
                  <div className="os-flotante__timer">
                    ⏱ {tiempoTranscurrido(os.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
