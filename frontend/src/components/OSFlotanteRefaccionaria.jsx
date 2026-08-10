import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOrdenesServicio, filtrosPorSurtir } from '../api/vehiculos';
import { getUser } from '../auth';
import '../styles/OSFlotante.css';

function nombreCliente(orden) {
  const c = orden.cliente || {};
  if (c.gobierno?.nombreGobierno) return c.gobierno.nombreGobierno;
  // apellidoPaterno/apellidoMaterno son de "Particular"; en empresas no se
  // concatenan porque en registros migrados/viejos pueden quedar huérfanos.
  if (c.tipoCliente !== 'Particular') return c.nombre || '—';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ') || '—';
}

function tiempoTranscurrido(fecha) {
  const diff = Date.now() - new Date(fecha).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

const SECCIONES = [
  {
    key: 'solicitudes',
    label: 'Solicitudes Taller',
    color: '#0d6efd',
    rutaTodos: '/refaccionaria/solicitudes-taller',
    rutaDetalle: (id) => `/refaccionaria/solicitudes-taller/${id}`,
  },
  {
    key: 'porSurtir',
    label: 'Por Surtir',
    color: '#6610f2',
    rutaTodos: '/refaccionaria/por-surtir',
    rutaDetalle: null,
  },
];

export default function OSFlotanteRefaccionaria() {
  const user = getUser();
  const esRefaccionario = user?.role === 'refaccionario';
  const navigate = useNavigate();

  const [ordenes, setOrdenes] = useState({ solicitudes: [], porSurtir: [] });
  const [minimizado, setMinimizado] = useState(false);
  // qué sección está expandida: null | 'solicitudes' | 'porSurtir'
  const [expandida, setExpandida] = useState(null);

  const [pos, setPos] = useState({ x: window.innerWidth - 300, y: 20 });
  const dragging = useRef(false);
  const hasDragged = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const widgetRef = useRef(null);

  const nombre = user?.name;

  const cargar = useCallback(async () => {
    try {
      const surtir = filtrosPorSurtir(nombre);
      const [r1, r2, r3] = await Promise.all([
        listOrdenesServicio({ estado: 'PENDIENTE_REFACCIONARIA', limit: 50 }),
        listOrdenesServicio({ ...surtir, estado: 'PENDIENTE_SURTIR', limit: 50 }),
        listOrdenesServicio({ ...surtir, estado: 'REPARACION_EN_CURSO', limit: 50 }),
      ]);
      setOrdenes({
        solicitudes: r1.data?.data || [],
        porSurtir: [
          ...(r2.data?.data || []),
          ...(r3.data?.data || []),
        ].sort((a, b) =>
          new Date(a.fechaEnvioSurtir || a.updatedAt) - new Date(b.fechaEnvioSurtir || b.updatedAt)
        ),
      });
    } catch {
      // silencioso
    }
  }, [nombre]);

  useEffect(() => {
    if (!esRefaccionario) return;
    cargar();
    const id = setInterval(cargar, 30000);
    return () => clearInterval(id);
  }, [esRefaccionario, cargar]);

  useEffect(() => {
    if (!esRefaccionario) return;
    const onVisible = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [esRefaccionario, cargar]);

  const startDrag = useCallback((clientX, clientY) => {
    dragging.current = true;
    hasDragged.current = false;
    offset.current = { x: clientX - pos.x, y: clientY - pos.y };
  }, [pos]);

  const onMouseDown = useCallback((e) => {
    if (e.target.closest('.os-flotante__toggle, .osref-seccion, .osref-orden')) return;
    startDrag(e.clientX, e.clientY);
    e.preventDefault();
  }, [startDrag]);

  const onTouchStart = useCallback((e) => {
    if (e.target.closest('.os-flotante__toggle, .osref-seccion, .osref-orden')) return;
    const t = e.touches[0];
    if (!t) return;
    startDrag(t.clientX, t.clientY);
  }, [startDrag]);

  useEffect(() => {
    const moveTo = (clientX, clientY) => {
      hasDragged.current = true;
      const newX = clientX - offset.current.x;
      const newY = clientY - offset.current.y;
      const maxX = window.innerWidth - (widgetRef.current?.offsetWidth || 280);
      const maxY = window.innerHeight - (widgetRef.current?.offsetHeight || 50);
      setPos({ x: Math.max(0, Math.min(newX, maxX)), y: Math.max(0, Math.min(newY, maxY)) });
    };
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      moveTo(e.clientX, e.clientY);
    };
    const onMouseUp = () => { dragging.current = false; };
    const onTouchMove = (e) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      if (!t) return;
      moveTo(t.clientX, t.clientY);
      e.preventDefault();
    };
    const onTouchEnd = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const total = ordenes.solicitudes.length + ordenes.porSurtir.length;

  if (!esRefaccionario || total === 0) return null;

  const resetDrag = () => { hasDragged.current = false; };

  const toggleSeccion = (key) => {
    if (hasDragged.current) return;
    setExpandida(prev => (prev === key ? null : key));
  };

  const irA = (e, ruta) => {
    e.stopPropagation();
    if (hasDragged.current) return;
    navigate(ruta);
  };

  return (
    <div
      ref={widgetRef}
      className="os-flotante osref"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="os-flotante__header os-flotante__header--refac"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onClick={() => { if (!hasDragged.current) setMinimizado(m => !m); }}
      >
        <span className="os-flotante__titulo">
          ⠿ Refaccionaria
          <span className="os-flotante__badge">{total}</span>
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
          {SECCIONES.map(({ key, label, color, rutaTodos, rutaDetalle }) => {
            const lista = ordenes[key];
            if (lista.length === 0) return null;
            const abierta = expandida === key;

            return (
              <div key={key} className="osref-seccion" onMouseDown={resetDrag} onTouchStart={resetDrag} onClick={() => toggleSeccion(key)}>
                {/* Cabecera de sección */}
                <div className="osref-seccion__header">
                  <span className="osref-seccion__badge" style={{ backgroundColor: color }}>
                    {lista.length}
                  </span>
                  <span className="osref-seccion__label">{label}</span>
                  <span className="osref-seccion__chevron">{abierta ? '▾' : '▸'}</span>
                </div>

                {/* Lista de órdenes (solo cuando está abierta) */}
                {abierta && (
                  <ul className="osref-lista">
                    {lista.map(os => (
                      <li
                        key={os._id}
                        className="osref-orden"
                        onMouseDown={(e) => { e.stopPropagation(); resetDrag(); }}
                        onTouchStart={(e) => { e.stopPropagation(); resetDrag(); }}
                        onClick={(e) => irA(e, rutaDetalle ? rutaDetalle(os._id) : rutaTodos)}
                      >
                        <div className="osref-orden__top">
                          <span className="osref-orden__num">{os.ordenServicio}</span>
                          <span className="osref-orden__tiempo">
                            {tiempoTranscurrido(os.fechaEnvioRefaccionaria || os.updatedAt || os.createdAt)}
                          </span>
                        </div>
                        <div className="osref-orden__cliente">{nombreCliente(os)}</div>
                        <div className="osref-orden__vehiculo">
                          {[os.marca, os.modelo, os.anio].filter(Boolean).join(' ') || '—'}
                        </div>
                      </li>
                    ))}
                    <li
                      className="osref-ver-todos"
                      onMouseDown={(e) => { e.stopPropagation(); resetDrag(); }}
                      onTouchStart={(e) => { e.stopPropagation(); resetDrag(); }}
                      onClick={(e) => irA(e, rutaTodos)}
                    >
                      Ver todos →
                    </li>
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
