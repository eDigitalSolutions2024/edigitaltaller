import React, { useEffect, useMemo, useState } from "react";
import { TARIFA_HORA, calcImporteHoras } from "../../utils/manoObra";
import Dropdown from "../../components/Dropdown";
import DateInput from "../../components/DateInput";

const formatMoney = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);

const overlay = { backgroundColor: "rgba(0,0,0,0.5)" };

// Puestos del personal que pueden ser técnico responsable de una mano de obra
// (se excluye el personal administrativo).
export const PUESTOS_TECNICOS = ["mecanico", "ayudante", "carrocero", "jefe_taller", "otro"];
export const PUESTO_LABEL = {
  mecanico: "Mecánico",
  ayudante: "Ayudante",
  carrocero: "Carrocero",
  jefe_taller: "Jefe de taller",
  jefe: "Jefe",
  otro: "Otro",
};

// Pregunta inicial al enviar a Venta: ¿la orden lleva mano de obra?
export function ModalPreguntaManoObra({ show, onSi, onNo, onCerrar }) {
  if (!show) return null;
  return (
    <div className="modal d-block" tabIndex="-1" style={overlay}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content mo-modal">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Mano de obra</h5>
            <button type="button" className="btn-close" onClick={onCerrar} />
          </div>
          <div className="modal-body">
            <p className="fs-5 mb-1">¿Esta orden lleva mano de obra?</p>
            <p className="text-muted mb-0">
              Si lleva, elegirás el servicio y el técnico responsable. Puedes decidirlo
              después desde la sección Mano de Obra.
            </p>
          </div>
          <div className="modal-footer d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary flex-fill" style={{ minHeight: 46 }} onClick={onNo}>
              No lleva
            </button>
            <button type="button" className="btn flex-fill rq-btn-agrupar" style={{ minHeight: 46 }} onClick={onSi}>
              Sí, agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Solo dígitos y un punto decimal (los <input type="number"> muestran flechas y teclado raro en tablet)
const soloDecimal = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*?)\./g, "$1");

const VACIO = { servicio: "", tecnico: "", horas: "", horasAnticipadas: "", fechaPago: "" };

// Alta / edición de una asignación de mano de obra: servicio + técnico
// responsable (obligatorio, de cualquier puesto técnico) + horas, fecha de
// pago y horas anticipadas. Un servicio puede tener varios técnicos: se
// guarda una asignación por técnico.
export default function ModalManoObra({
  show,
  servicios, // [{ concepto, precioVenta }]
  tecnicos, // empleados [{ _id, nombre, puesto, activo }]
  inicial, // fila de manoObra a editar, o null para alta
  bloqueadoAnticipo,
  guardando,
  onClose,
  onGuardar, // async (fila, { otro }) => boolean
}) {
  const [f, setF] = useState(VACIO);
  const [error, setError] = useState("");

  const idInicial = inicial ? (inicial.esCarroceria ? inicial.carrocero : inicial.mecanico) : "";

  useEffect(() => {
    if (!show) return;
    setError("");
    if (inicial) {
      setF({
        servicio: inicial.concepto || "",
        tecnico: idInicial || "",
        horas: inicial.horas ?? "",
        horasAnticipadas: inicial.horasAnticipadas || "",
        fechaPago: inicial.fechaPago || "",
      });
    } else {
      setF({ ...VACIO, servicio: servicios.length === 1 ? servicios[0].concepto : "" });
    }
  }, [show, inicial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Técnicos elegibles agrupados por puesto (el ya asignado se conserva aunque esté inactivo)
  const grupos = useMemo(() => {
    const elegibles = (tecnicos || []).filter(
      (t) => (t.activo !== false && PUESTOS_TECNICOS.includes(t.puesto)) || t._id === idInicial
    );
    return PUESTOS_TECNICOS.concat(["jefe"])
      .map((p) => ({ puesto: p, lista: elegibles.filter((t) => t.puesto === p) }))
      .filter((g) => g.lista.length > 0);
  }, [tecnicos, idInicial]);

  if (!show) return null;

  const set = (campo, valor) => setF((p) => ({ ...p, [campo]: valor }));
  const empleado = (tecnicos || []).find((t) => t._id === f.tecnico);
  const serv = servicios.find((s) => s.concepto === f.servicio);
  const horasNum = Number(f.horas) || 0;
  const anticipadasNum = Math.max(0, Math.min(Number(f.horasAnticipadas) || 0, horasNum));

  const construir = () => {
    if (!f.servicio) { setError("Selecciona el servicio."); return null; }
    if (!f.tecnico || !empleado) { setError("Selecciona el técnico responsable."); return null; }
    const esCarroceria = empleado.puesto === "carrocero";
    return {
      ...(inicial || { observaciones: "", precioCarroceria: 0 }),
      concepto: f.servicio,
      precioServicio: Number(serv?.precioVenta || inicial?.precioServicio || 0),
      mecanico: esCarroceria ? "" : empleado._id,
      carrocero: esCarroceria ? empleado._id : "",
      esCarroceria,
      puesto: empleado.puesto || "",
      horas: horasNum,
      horasAnticipadas: anticipadasNum,
      fechaPago: f.fechaPago,
    };
  };

  const guardar = async (otro) => {
    setError("");
    const fila = construir();
    if (!fila) return;
    const ok = await onGuardar(fila, { otro });
    if (ok && otro) setF((p) => ({ ...VACIO, servicio: p.servicio }));
  };

  return (
    <div className="modal d-block" tabIndex="-1" style={overlay}>
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg mo-ancho">
        <div className="modal-content mo-modal">
          <div className="modal-header">
            <div>
              <h5 className="modal-title fw-bold mb-0">
                {inicial ? "Editar mano de obra" : "Agregar mano de obra"}
              </h5>
              <div className="text-muted small">Asigna un técnico responsable a un servicio de la orden</div>
            </div>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            {servicios.length === 0 ? (
              <div className="alert alert-warning mb-0">
                Todavía no hay partidas en Venta al Cliente. Envía partidas autorizadas a Venta para
                poder asignarles mano de obra.
              </div>
            ) : (
              <>
                <div className="row g-3 mo-seccion">
                <div className="col-12 col-md-6">
                  <label className="mo-label">Servicio</label>
                  <Dropdown value={f.servicio} onChange={(e) => set("servicio", e.target.value)}>
                    <Dropdown.Option value="">Seleccionar servicio…</Dropdown.Option>
                    {servicios.map((s, i) => (
                      <Dropdown.Option key={i} value={s.concepto}>{s.concepto}</Dropdown.Option>
                    ))}
                  </Dropdown>
                  {serv && <div className="mo-ayuda">Precio de venta: {formatMoney(serv.precioVenta)}</div>}
                </div>

                <div className="col-12 col-md-6">
                  <label className="mo-label">Técnico responsable <span className="text-danger">*</span></label>
                  <Dropdown value={f.tecnico} onChange={(e) => set("tecnico", e.target.value)}>
                    <Dropdown.Option value="">Seleccionar técnico…</Dropdown.Option>
                    {grupos.map((g) => [
                      <Dropdown.Option key={`h-${g.puesto}`} value={`__${g.puesto}`} disabled>
                        {(PUESTO_LABEL[g.puesto] || g.puesto).toUpperCase()}
                      </Dropdown.Option>,
                      ...g.lista.map((t) => (
                        <Dropdown.Option key={t._id} value={t._id}>
                          {t.nombre}{t.activo === false ? " (inactivo)" : ""}
                        </Dropdown.Option>
                      )),
                    ])}
                  </Dropdown>
                  {empleado && <div className="mo-ayuda">Puesto: {PUESTO_LABEL[empleado.puesto] || empleado.puesto}</div>}
                </div>

                </div>

                <div className="row g-3 mo-seccion">
                  <div className="col-12 col-sm-4">
                    <label className="mo-label">Horas</label>
                    <input type="text" inputMode="decimal" autoComplete="off" className="form-control mo-num" placeholder="0"
                      value={f.horas} onChange={(e) => set("horas", soloDecimal(e.target.value))} />
                  </div>
                  <div className="col-12 col-sm-4">
                    <label className="mo-label">Horas anticipadas</label>
                    <input type="text" inputMode="decimal" autoComplete="off" className="form-control mo-num" placeholder="0"
                      value={f.horasAnticipadas}
                      disabled={bloqueadoAnticipo}
                      title={bloqueadoAnticipo ? "No se puede anticipar: esta orden ya tiene una Remisión o Nota de Venta registrada." : ""}
                      onChange={(e) => set("horasAnticipadas", soloDecimal(e.target.value))} />
                  </div>
                  <div className="col-12 col-sm-4">
                    <label className="mo-label">Fecha de pago</label>
                    <DateInput value={f.fechaPago} onChange={(e) => set("fechaPago", e.target.value)} />
                  </div>
                  {bloqueadoAnticipo && (
                    <div className="col-12 mo-ayuda text-danger mt-1">
                      No se pueden anticipar horas: la orden ya tiene Remisión o Nota de Venta.
                    </div>
                  )}
                </div>

                <div className="mo-resumen">
                  <div><span>Tarifa</span><b>{formatMoney(TARIFA_HORA)} / hora</b></div>
                  <div><span>Horas pendientes</span><b>{Math.max(0, horasNum - anticipadasNum)}</b></div>
                  <div className="mo-resumen-total"><span>Total mano de obra</span><b>{formatMoney(calcImporteHoras(horasNum))}</b></div>
                </div>

                {error && <div className="alert alert-danger py-2 mt-3 mb-0">{error}</div>}
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-link text-secondary me-auto" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            {servicios.length > 0 && !inicial && (
              <button type="button" className="btn pv-btn-detalle" style={{ minHeight: 44 }} onClick={() => guardar(true)} disabled={guardando}>
                Guardar y agregar otro
              </button>
            )}
            {servicios.length > 0 && (
              <button type="button" className="btn rq-btn-agrupar px-4" style={{ minHeight: 44 }} onClick={() => guardar(false)} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
