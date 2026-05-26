// src/pages/vehiculo/VehiculoCalidad.jsx
import React, { useState } from "react";
import { saveCalidad } from "../../api/vehiculos";

function formatFecha(fechaIso) {
  if (!fechaIso) return "";
  const d = new Date(fechaIso);
  if (isNaN(d.getTime())) return fechaIso;
  return d.toLocaleDateString("es-MX");
}

const LABELS_PREVENTIVOS = {
  afinacion: "Afinación",
  limpiezaInyectores: "Limpieza de Inyectores",
  limpiezaCuerpoAceleracion: "Limpieza Cuerpo de Aceleración",
  lubricacion: "Lubricación",
  cambioAceite: "Cambio de Aceite",
  engrase: "Engrase",
  revisionNivelesFluidos: "Revisión Niveles de Fluidos",
  lubricacionBisagras: "Lubricación de Bisagras",
  lubricarSuspensionDireccion: "Lubricar Suspensión y Dirección",
  revisionCarretera: "Revisión de Carretera",
  diagnosticoCompra: "Diagnóstico de Compra",
  otrosServicios: "Otros Servicios",
  alineacionComputadora: "Alineación por Computadora",
  balanceo4Ruedas: "Balanceo 4 Ruedas",
  reemplazoBalatas4Ruedas: "Reemplazo Balatas 4 Ruedas",
  recargaGasAC: "Recarga Gas A/C",
  servicioCoolingTermostato: "Servicio Cooling / Termostato",
};

const s = {
  page: { padding: "1.5rem 0", fontFamily: "Arial, sans-serif", fontSize: "0.875rem" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" },
  sectionTitle: { fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#6b7280", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "8px" },
  sectionLine: { flex: 1, height: "1px", background: "#e5e7eb" },
  headerTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem" },
  ordenNum: { fontSize: "20px", fontWeight: 700, color: "#1f2937" },
  ordenSub: { fontSize: "12px", color: "#6b7280", marginTop: "3px" },
  vehiclePill: { display: "flex", alignItems: "center", gap: "10px", background: "#f3f4f6", borderRadius: "8px", padding: "10px 14px" },
  vehicleName: { fontSize: "13px", fontWeight: 700, color: "#1f2937" },
  vehicleDetail: { fontSize: "11px", color: "#6b7280", marginTop: "1px" },
  infoGrid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" },
  infoGrid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 24px" },
  fieldLabel: { fontSize: "10px", color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" },
  fieldValue: { fontSize: "13px", color: "#1f2937", fontWeight: 500 },
  fieldEmpty: { fontSize: "13px", color: "#9ca3af", fontWeight: 400 },
  tablaHeader: { display: "grid", gridTemplateColumns: "2fr 1fr 80px 1fr", gap: "8px", padding: "6px 10px", background: "#f3f4f6", borderRadius: "6px", marginBottom: "4px" },
  tablaHeaderSpan: { fontSize: "10px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" },
  tablaRow: { display: "grid", gridTemplateColumns: "2fr 1fr 80px 1fr", gap: "8px", padding: "9px 10px", borderBottom: "1px solid #f3f4f6", alignItems: "center" },
  tablaCell: { fontSize: "13px", color: "#1f2937" },
  tablaCellMuted: { fontSize: "12px", color: "#9ca3af" },
  diagLabel: { fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", marginTop: "12px", borderTop: "1px solid #f3f4f6", paddingTop: "12px" },
  diagBox: { fontSize: "13px", color: "#1f2937", background: "#f9fafb", borderRadius: "6px", padding: "10px 12px", lineHeight: 1.6 },
  trabajosGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" },
  trabajoCol: { background: "#f9fafb", borderRadius: "8px", padding: "1rem" },
  trabajoH4: { fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#6b7280", marginBottom: "10px" },
  trabajoItem: { display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", borderBottom: "1px solid #e5e7eb", fontSize: "13px", color: "#1f2937" },
  dotPrev: { width: "6px", height: "6px", borderRadius: "50%", background: "#7C3AED", flexShrink: 0 },
  dotCorr: { width: "6px", height: "6px", borderRadius: "50%", background: "#0284c7", flexShrink: 0 },
  obsBox: { width: "100%", border: "1px solid #d1d5db", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", fontFamily: "Arial, sans-serif", color: "#1f2937", background: "#fff", resize: "vertical", minHeight: "80px" },
  btns: { display: "flex", gap: "12px", marginTop: "1.5rem" },
  btnRechazar: { flex: 1, padding: "12px", borderRadius: "8px", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer", background: "#fee2e2", color: "#991b1b", letterSpacing: "0.5px" },
  btnAceptar: { flex: 1, padding: "12px", borderRadius: "8px", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer", background: "#C0392B", color: "#fff", letterSpacing: "0.5px" },
  badgePendiente: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", background: "#fef3c7", color: "#92400e", verticalAlign: "middle" },
  alertSuccess: { background: "#dcfce7", color: "#166534", borderRadius: "8px", padding: "12px 16px", textAlign: "center", marginBottom: "1rem", fontWeight: 700 },
  alertDanger: { background: "#fee2e2", color: "#991b1b", borderRadius: "8px", padding: "12px 16px", textAlign: "center", marginBottom: "1rem", fontWeight: 700 },
};

function SectionTitle({ icon, children }) {
  return (
    <div style={s.sectionTitle}>
      <i className={`ti ti-${icon}`} style={{ fontSize: "13px" }} aria-hidden="true" />
      {children}
      <span style={s.sectionLine} />
    </div>
  );
}

function Field({ label, value, small }) {
  return (
    <div>
      <div style={s.fieldLabel}>{label}</div>
      {value
        ? <div style={{ ...s.fieldValue, ...(small ? { fontSize: "11px" } : {}) }}>{value}</div>
        : <div style={s.fieldEmpty}>—</div>
      }
    </div>
  );
}

export default function VehiculoCalidad({ orden, onSaved }) {
  const [observaciones, setObservaciones] = useState(orden?.observacionesCalidad || "");
  const [guardando, setGuardando] = useState(false);

  const [preventivosExtra, setPreventivosExtra] = useState(
    orden?.preventivosExtra || ""
  );
  const [correctivosExtra, setCorrectivosExtra] = useState(
    orden?.correctivosExtra || ""
  );

  if (!orden) return null;

  const manoObra = orden.manoObra || [];
  const sr = orden.servicioReparacion || {};

  const preventivos = Object.entries(sr.mantenimientoMotor || {})
    .filter(([, val]) => val === true)
    .map(([key]) => LABELS_PREVENTIVOS[key] || key);

  const correctivos = manoObra.map((m) => m.concepto || m.servicio).filter(Boolean);

  const yaProcesada =
    orden.resultadoCalidad &&
    ["PENDIENTE_CERRAR", "CERRADA", "REPARACION_EN_CURSO"].includes(orden.estadoOrden);

  const nombreCliente =
    orden.nombreCliente ||
    orden.nombreGobierno ||
    [orden.nombre, orden.apellidoPaterno, orden.apellidoMaterno].filter(Boolean).join(" ") ||
    "—";

  const handleCalidad = async (resultado) => {
    const msg =
      resultado === "ACEPTADO"
        ? "¿Confirmas que la revisión de calidad fue ACEPTADA?\nLa orden pasará a Pendiente de Cerrar."
        : "¿Confirmas que la revisión de calidad fue RECHAZADA?\nLa orden regresará a Reparación en Curso.";
    if (!window.confirm(msg)) return;
    try {
      setGuardando(true);
      const res = await saveCalidad(orden._id, {
        resultado,
        observacionesCalidad: observaciones,
        preventivosExtra,   // 👈
        correctivosExtra,   // 👈
      });
      if (onSaved) onSaved(res.data.vehiculo);
    } catch (err) {
      console.error(err);
      alert("Error al guardar la revisión de calidad.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={s.page}>

      {/* ── Encabezado ── */}
      <div style={s.headerTop}>
        <div>
          <div style={s.ordenNum}>Revisión de calidad</div>
          <div style={s.ordenSub}>
            Orden #{orden.ordenServicio || orden._id}
            {orden.fechaRecepcion && ` · Recepción: ${formatFecha(orden.fechaRecepcion)}`}
            {orden.horaRecepcion && ` · ${orden.horaRecepcion} hrs`}
            {" · "}
            <span style={s.badgePendiente}>{orden.estadoOrden?.replace(/_/g, " ") || "PENDIENTE"}</span>
          </div>
        </div>
        <div style={s.vehiclePill}>
          <i className="ti ti-car" style={{ fontSize: "20px", color: "#6b7280" }} aria-hidden="true" />
          <div>
            <div style={s.vehicleName}>
              {[orden.marca, orden.modelo, orden.anio].filter(Boolean).join(" ") || "Vehículo"}
            </div>
            <div style={s.vehicleDetail}>
              {[orden.color, orden.placas].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Cliente y asesor ── */}
      <div style={s.card}>
        <SectionTitle icon="user">Cliente y asesor</SectionTitle>
        <div style={s.infoGrid2}>
          <Field label="Nombre cliente" value={nombreCliente} />
          <Field label="Asesor de servicio" value={orden.asesorServicio} />
          <Field label="Refaccionario" value={orden.refaccionario} />
          <Field label="Fecha promesa" value={formatFecha(orden.fechaPromesa)} />
        </div>
      </div>

      {/* ── Datos del vehículo ── */}
      <div style={s.card}>
        <SectionTitle icon="car">Datos del vehículo</SectionTitle>
        <div style={s.infoGrid3}>
          <Field label="Marca" value={orden.marca} />
          <Field label="Modelo" value={orden.modelo} />
          <Field label="Año" value={orden.anio} />
          <Field label="Color" value={orden.color} />
          <Field label="Placas" value={orden.placas} />
          <Field label="KMS / Millas" value={orden.kmsMillas} />
          <Field label="Serie" value={orden.serie} small />
          <Field label="Núm. económico" value={orden.numeroEconomico} />
          <Field label="Nacionalidad" value={orden.nacionalidad} />
        </div>
      </div>

      {/* ── Mano de obra ── */}
      <div style={s.card}>
        <SectionTitle icon="tool">Mano de obra</SectionTitle>
        <div style={s.tablaHeader}>
          <span style={s.tablaHeaderSpan}>Servicio / Reparación</span>
          <span style={s.tablaHeaderSpan}>Mecánico</span>
          <span style={{ ...s.tablaHeaderSpan, textAlign: "center" }}>Horas</span>
          <span style={s.tablaHeaderSpan}>Observaciones</span>
        </div>

        {manoObra.length === 0 ? (
          <div style={{ padding: "12px 10px", fontSize: "13px", color: "#9ca3af", textAlign: "center" }}>
            Sin registros de mano de obra.
          </div>
        ) : (
          manoObra.map((m, i) => (
            <div key={i} style={{ ...s.tablaRow, ...(i === manoObra.length - 1 ? { borderBottom: "none" } : {}) }}>
              <span style={s.tablaCell}>{m.concepto || m.servicio || "—"}</span>
              <span style={s.tablaCell}>{m.mecanico?.nombre || m.mecanico || "—"}</span>
              <span style={{ ...s.tablaCell, textAlign: "center" }}>{m.horas ? `${m.horas} HRS` : "—"}</span>
              <span style={s.tablaCellMuted}>{m.observaciones || "NA"}</span>
            </div>
          ))
        )}

        {(sr.fallasReportadasCliente || orden.diagnosticoTecnico) && (
          <>
            <div style={s.diagLabel}>Diagnóstico del técnico</div>
            <div style={s.diagBox}>
              {sr.fallasReportadasCliente || orden.diagnosticoTecnico}
            </div>
          </>
        )}
      </div>

      {/* ── Trabajos realizados ── */}
      <div style={s.card}>
        <SectionTitle icon="checklist">Trabajos realizados</SectionTitle>
        <div style={s.trabajosGrid}>

          {/* PREVENTIVOS */}
          <div style={s.trabajoCol}>
            <div style={s.trabajoH4}>Preventivos</div>

            {/* Los que vienen de la orden */}
            {preventivos.length > 0 && (
              <div style={{ marginBottom: "10px" }}>
                {preventivos.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      ...s.trabajoItem,
                      ...(i === preventivos.length - 1 && !preventivosExtra
                        ? { borderBottom: "none" }
                        : {}),
                    }}
                  >
                    <span style={s.dotPrev} />
                    {p}
                  </div>
                ))}
              </div>
            )}

            {/* Textarea para agregar más */}
            <textarea
              style={{
                ...s.obsBox,
                minHeight: "70px",
                fontSize: "12px",
                marginTop: preventivos.length > 0 ? "6px" : "0",
              }}
              placeholder="Agregar preventivos adicionales..."
              value={preventivosExtra}
              onChange={(e) => setPreventivosExtra(e.target.value)}
              disabled={yaProcesada || guardando}
            />
          </div>

          {/* CORRECTIVOS */}
          <div style={s.trabajoCol}>
            <div style={s.trabajoH4}>Correctivos</div>

            {/* Los que vienen de la orden */}
            {correctivos.length > 0 && (
              <div style={{ marginBottom: "10px" }}>
                {correctivos.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      ...s.trabajoItem,
                      ...(i === correctivos.length - 1 ? { borderBottom: "none" } : {}),
                    }}
                  >
                    <span style={s.dotCorr} />
                    {c}
                  </div>
                ))}
              </div>
            )}

            {/* Textarea para agregar más */}
            <textarea
              style={{
                ...s.obsBox,
                minHeight: "70px",
                fontSize: "12px",
                marginTop: correctivos.length > 0 ? "6px" : "0",
              }}
              placeholder="Agregar correctivos adicionales..."
              value={correctivosExtra}
              onChange={(e) => setCorrectivosExtra(e.target.value)}
              disabled={yaProcesada || guardando}
            />
          </div>

        </div>
      </div>

      {/* ── Observaciones ── */}
      <div style={s.card}>
        <SectionTitle icon="message">Observaciones de calidad</SectionTitle>
        <textarea
          style={s.obsBox}
          rows={3}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          disabled={yaProcesada || guardando}
          placeholder="Escriba observaciones de la revisión de calidad..."
        />
      </div>

      {/* ── Resultado previo ── */}
      {yaProcesada && (
        <div style={orden.resultadoCalidad === "ACEPTADO" ? s.alertSuccess : s.alertDanger}>
          Revisión de calidad: {orden.resultadoCalidad === "ACEPTADO" ? "ACEPTADA" : "RECHAZADA"}
          {orden.fechaCalidad && (
            <span style={{ marginLeft: "8px", fontWeight: 400, fontSize: "12px" }}>
              — {formatFecha(orden.fechaCalidad)}
            </span>
          )}
        </div>
      )}

      {/* ── Botones ── */}
      {!yaProcesada && (
        <div style={s.btns}>
          <button style={s.btnRechazar} onClick={() => handleCalidad("RECHAZADO")} disabled={guardando}>
            <i className="ti ti-x" style={{ fontSize: "15px", verticalAlign: "-2px", marginRight: "6px" }} aria-hidden="true" />
            {guardando ? "Guardando..." : "Rechazado"}
          </button>
          <button style={s.btnAceptar} onClick={() => handleCalidad("ACEPTADO")} disabled={guardando}>
            <i className="ti ti-check" style={{ fontSize: "15px", verticalAlign: "-2px", marginRight: "6px" }} aria-hidden="true" />
            {guardando ? "Guardando..." : "Aceptado"}
          </button>
        </div>
      )}

    </div>
  );
}