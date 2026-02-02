import { useMemo, useState } from "react";
import http from "../../../api/http"; // usa tu axios con baseURL del backend

const fmx = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const hoyYMD = () => new Date().toISOString().slice(0, 10);

const nuevaFila = () => ({
  cantidad: 1,
  unidad: "Pieza",
  codigoInterno: "",
  codigoProveedor: "",
  marca: "",
  precioUnitario: 0,
  ivaPct: 16,
  ordenServicio: "",
  notas: "",
});

export default function DevPieza() {
  const [started, setStarted] = useState(false);
  const [sending, setSending] = useState(false);

  // Paso 1 + encabezado general
  const [head, setHead] = useState({
    fechaDevolucion: hoyYMD(),
    facturaNumero: "",
    motivo: "",
    proveedor: "",
    fechaRecibe: hoyYMD(),
    quienRecibe: "",
    observaciones: "",
    facturaCambio: "", // opcional
  });
  const onHead = (e) => setHead((h) => ({ ...h, [e.target.name]: e.target.value }));
  const step1Valid = head.fechaDevolucion && head.facturaNumero && head.motivo;

  // Tablas
  const [rowsIn, setRowsIn] = useState([nuevaFila()]);     // PIEZA DEVUELTA → ENTRA a inventario
  const [rowsOut, setRowsOut] = useState([nuevaFila()]);   // PIEZA A CAMBIO → SALE de inventario

  const updIn  = (i,k,v)=> setRowsIn (rs=>{ const c=[...rs]; c[i]={...c[i],[k]:v}; return c; });
  const updOut = (i,k,v)=> setRowsOut(rs=>{ const c=[...rs]; c[i]={...c[i],[k]:v}; return c; });

  const addIn  = ()=> setRowsIn (rs=>[...rs, nuevaFila()]);
  const addOut = ()=> setRowsOut(rs=>[...rs, nuevaFila()]);

  const delIn  = (i)=> setRowsIn (rs=> rs.length>1 ? rs.filter((_,j)=>j!==i) : rs);
  const delOut = (i)=> setRowsOut(rs=> rs.length>1 ? rs.filter((_,j)=>j!==i) : rs);

  const calcRow = (r)=>{
    const cant = Number(r.cantidad||0);
    const pu   = Number(r.precioUnitario||0);
    const ivaP = Number(r.ivaPct||0);
    const subtotal = cant*pu;
    const iva = subtotal*(ivaP/100);
    const total = subtotal+iva;
    return { subtotal, iva, total };
  };

  const totIn = useMemo(()=> rowsIn.reduce((a,r)=>{
    const t=calcRow(r); a.subtotal+=t.subtotal; a.iva+=t.iva; a.total+=t.total; return a;
  },{subtotal:0,iva:0,total:0}),[rowsIn]);

  const totOut = useMemo(()=> rowsOut.reduce((a,r)=>{
    const t=calcRow(r); a.subtotal+=t.subtotal; a.iva+=t.iva; a.total+=t.total; return a;
  },{subtotal:0,iva:0,total:0}),[rowsOut]);

  const diferencia = useMemo(()=> totOut.total - totIn.total, [totIn, totOut]); // >0 cobra, <0 abona

  const submit = async ()=>{
    setSending(true);
    try{
      const payload = {
        tipo: "PIEZA",
        ...head,
        lineasEntrada: rowsIn.map(r=>({ ...r, cantidad:Number(r.cantidad||0), precioUnitario:Number(r.precioUnitario||0), ivaPct:Number(r.ivaPct||0) })), // devuelta (entra)
        lineasSalida:  rowsOut.map(r=>({ ...r, cantidad:Number(r.cantidad||0), precioUnitario:Number(r.precioUnitario||0), ivaPct:Number(r.ivaPct||0) })), // a cambio (sale)
      };
      const { data } = await http.post("/devoluciones/pieza", payload);
      alert(`Intercambio registrado.\nFolio: ${data.folio}\nTotal devuelto: ${fmx.format(data.totalesEntrada.total)}\nTotal cambio: ${fmx.format(data.totalesSalida.total)}\nDiferencia: ${fmx.format(data.diferencia)}`);
      // reset
      setRowsIn([nuevaFila()]);
      setRowsOut([nuevaFila()]);
      setHead({ ...head, motivo:"", observaciones:"", facturaCambio:"" });
      setStarted(false);
    }catch(err){
      console.error(err);
      alert(err?.response?.data?.msg || "Error al registrar pieza x pieza");
    }finally{
      setSending(false);
    }
  };

  const Tabla = ({titulo, rows, upd, del}) => (
    <div className="card shadow-sm mb-4">
      <div className="card-header">{titulo}</div>
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-bordered align-middle">
            <thead className="table-light">
              <tr>
                <th style={{minWidth:80}}>Cant</th>
                <th style={{minWidth:120}}>Unidad</th>
                <th style={{minWidth:160}}>Código Interno</th>
                <th style={{minWidth:160}}>Código Proveedor</th>
                <th style={{minWidth:120}}>Marca</th>
                <th style={{minWidth:110}}>PU</th>
                <th style={{minWidth:90}}>IVA %</th>
                <th style={{minWidth:120}}>Subtotal</th>
                <th style={{minWidth:120}}>IVA</th>
                <th style={{minWidth:120}}>Total</th>
                <th style={{minWidth:130}}>Orden Serv.</th>
                <th style={{minWidth:90}}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>{
                const t = calcRow(r);
                return (
                  <tr key={i}>
                    <td><input type="number" min="0" step="1" value={r.cantidad} onChange={e=>upd(i,'cantidad',e.target.value)} className="form-control form-control-sm" /></td>
                    <td><input value={r.unidad} onChange={e=>upd(i,'unidad',e.target.value)} className="form-control form-control-sm" /></td>
                    <td><input value={r.codigoInterno} onChange={e=>upd(i,'codigoInterno',e.target.value)} className="form-control form-control-sm" /></td>
                    <td><input value={r.codigoProveedor} onChange={e=>upd(i,'codigoProveedor',e.target.value)} className="form-control form-control-sm" /></td>
                    <td><input value={r.marca} onChange={e=>upd(i,'marca',e.target.value)} className="form-control form-control-sm" /></td>
                    <td><input type="number" step="0.01" value={r.precioUnitario} onChange={e=>upd(i,'precioUnitario',e.target.value)} className="form-control form-control-sm" /></td>
                    <td><input type="number" step="0.01" value={r.ivaPct} onChange={e=>upd(i,'ivaPct',e.target.value)} className="form-control form-control-sm" /></td>
                    <td className="text-end">{fmx.format(t.subtotal)}</td>
                    <td className="text-end">{fmx.format(t.iva)}</td>
                    <td className="text-end">{fmx.format(t.total)}</td>
                    <td><input value={r.ordenServicio} onChange={e=>upd(i,'ordenServicio',e.target.value)} className="form-control form-control-sm" /></td>
                    <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>del(i)}>Quitar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container-fluid py-3">
      <h1 className="display-6 mb-3">DEVOLUCIÓN MATERIAL PIEZA x PIEZA</h1>

      {/* Paso 1 */}
      {!started && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-sm-4">
                <label className="form-label">Fecha Devolución</label>
                <input type="date" name="fechaDevolucion" value={head.fechaDevolucion} onChange={onHead} className="form-control"/>
              </div>
              <div className="col-sm-4">
                <label className="form-label">Número de Factura</label>
                <input type="text" name="facturaNumero" value={head.facturaNumero} onChange={onHead} className="form-control" placeholder="Ej. F-12345"/>
              </div>
              <div className="col-sm-8">
                <label className="form-label">Motivo</label>
                <input type="text" name="motivo" value={head.motivo} onChange={onHead} className="form-control" placeholder="Describe brevemente el motivo"/>
              </div>
            </div>
            <div className="mt-4">
              <button className="btn btn-primary" disabled={!step1Valid} onClick={()=>setStarted(true)}>Comenzar captura</button>
            </div>
          </div>
        </div>
      )}

      {/* Paso 2 */}
      {started && (
        <>
          <div className="card shadow-sm mb-4">
            <div className="card-header">Datos del Intercambio</div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label">Proveedor</label>
                  <input type="text" name="proveedor" value={head.proveedor} onChange={onHead} className="form-control" />
                </div>
                <div className="col-sm-4">
                  <label className="form-label">Fecha Recibe</label>
                  <input type="date" name="fechaRecibe" value={head.fechaRecibe} onChange={onHead} className="form-control" />
                </div>
                <div className="col-sm-4">
                  <label className="form-label">Quién lo recibe</label>
                  <input type="text" name="quienRecibe" value={head.quienRecibe} onChange={onHead} className="form-control" />
                </div>
                <div className="col-md-8">
                  <label className="form-label">Observaciones</label>
                  <input type="text" name="observaciones" value={head.observaciones} onChange={onHead} className="form-control" />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Factura a cambio (opcional)</label>
                  <input type="text" name="facturaCambio" value={head.facturaCambio} onChange={onHead} className="form-control" placeholder="Folio/ID de la factura a cambio" />
                </div>
              </div>
            </div>
          </div>

          <Tabla titulo="PIEZA DEVUELTA (reingresa al inventario)" rows={rowsIn} upd={updIn} del={delIn} />
          <div className="mb-2">
            <button type="button" className="btn btn-secondary me-2" onClick={addIn}>Agregar renglón (Devuelta)</button>
          </div>

          <Tabla titulo="PIEZA A CAMBIO (sale del inventario)" rows={rowsOut} upd={updOut} del={delOut} />
          <div className="mb-2">
            <button type="button" className="btn btn-secondary me-2" onClick={addOut}>Agregar renglón (A cambio)</button>
          </div>

          <div className="card shadow-sm mb-4">
            <div className="card-body">
              <div className="row text-end">
                <div className="col-sm-4 offset-sm-8">
                  <div className="d-flex justify-content-between"><strong>Total devuelto:</strong><span>{fmx.format(totIn.total)}</span></div>
                  <div className="d-flex justify-content-between"><strong>Total a cambio:</strong><span>{fmx.format(totOut.total)}</span></div>
                  <div className="d-flex justify-content-between"><strong>Diferencia:</strong><span>{fmx.format(diferencia)}</span></div>
                  <small className="text-muted">Diferencia = Cambio − Devuelto. Positivo: cobra; Negativo: abona.</small>
                </div>
              </div>

              <div className="mt-3 d-flex gap-2">
                <button className="btn btn-outline-dark" onClick={()=>setStarted(false)}>Volver</button>
                <button className="btn btn-primary" disabled={sending} onClick={submit}>
                  {sending ? "Guardando…" : "Registrar Intercambio"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
