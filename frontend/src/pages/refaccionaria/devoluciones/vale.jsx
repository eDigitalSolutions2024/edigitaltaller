import { useMemo, useState } from "react";
import http from "../../../api/http"; // axios con baseURL a tu backend

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

export default function DevVale() {
  const [started, setStarted] = useState(false);
  const [sending, setSending] = useState(false);
  const [vale, setVale] = useState(null); // {codigo, monto, saldo, estado}

  // Paso 1 + encabezado
  const [head, setHead] = useState({
    fechaDevolucion: hoyYMD(),
    facturaNumero: "",
    motivo: "",
    proveedor: "",
    fechaRecibe: hoyYMD(),
    quienRecibe: "",
    observaciones: "",
  });
  const onHead = (e) => setHead((h) => ({ ...h, [e.target.name]: e.target.value }));
  const step1Valid = head.fechaDevolucion && head.facturaNumero && head.motivo;

  // renglones devueltos (reingresan a inventario)
  const [rows, setRows] = useState([nuevaFila()]);
  const upd = (i,k,v)=> setRows(rs => { const c=[...rs]; c[i]={...c[i],[k]:v}; return c; });
  const add = ()=> setRows(rs => [...rs, nuevaFila()]);
  const del = (i)=> setRows(rs => rs.length>1 ? rs.filter((_,j)=>j!==i) : rs);

  const calcRow = (r)=>{
    const cant = Number(r.cantidad||0);
    const pu   = Number(r.precioUnitario||0);
    const ivaP = Number(r.ivaPct||0);
    const subtotal = cant*pu;
    const iva = subtotal*(ivaP/100);
    const total = subtotal+iva;
    return { subtotal, iva, total };
  };
  const totales = useMemo(()=> rows.reduce((a,r)=>{
    const t=calcRow(r); a.subtotal+=t.subtotal; a.iva+=t.iva; a.total+=t.total; return a;
  },{subtotal:0,iva:0,total:0}),[rows]);

  const generarVale = async ()=>{
    setSending(true);
    try{
      const payload = {
        tipo: "VALE",
        ...head,
        lineas: rows.map(r=>({
          cantidad: Number(r.cantidad||0),
          unidad: r.unidad,
          codigoInterno: r.codigoInterno,
          codigoProveedor: r.codigoProveedor,
          marca: r.marca,
          precioUnitario: Number(r.precioUnitario||0),
          ivaPct: Number(r.ivaPct||0),
          ordenServicio: r.ordenServicio,
          notas: r.notas,
        })),
      };
      const { data } = await http.post("/devoluciones/vale", payload);
      setVale(data.vale);
      alert(`Devolución guardada. Folio: ${data.folio}\nVale: ${data.vale.codigo}\nMonto: ${fmx.format(data.vale.monto)}`);
    }catch(err){
      console.error(err);
      alert(err?.response?.data?.msg || "Error al generar el vale");
    }finally{
      setSending(false);
    }
  };

  const finalizar = ()=>{
    // simple reset; si quieres imprimir, aquí navega a /impresion o abre modal
    setRows([nuevaFila()]);
    setHead({ ...head, motivo:"", observaciones:"" });
    setVale(null);
    setStarted(false);
  };

  const copy = async (txt)=> { try{ await navigator.clipboard.writeText(txt);}catch{} };

  return (
    <div className="container-fluid py-3">
      <h1 className="display-6 mb-3">DEVOLUCIONES DE MATERIAL POR VALE (EN ESPECIE)</h1>

      {/* ===== Paso 1 ===== */}
      {!started && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-sm-4">
                <label className="form-label">Fecha Devolución</label>
                <input type="date" name="fechaDevolucion" value={head.fechaDevolucion} onChange={onHead} className="form-control" />
              </div>
              <div className="col-sm-4">
                <label className="form-label">Número de Factura</label>
                <input type="text" name="facturaNumero" value={head.facturaNumero} onChange={onHead} className="form-control" placeholder="Ej. F-12345" />
              </div>
              <div className="col-sm-8">
                <label className="form-label">Motivo</label>
                <input type="text" name="motivo" value={head.motivo} onChange={onHead} className="form-control" placeholder="Describe brevemente el motivo" />
              </div>
            </div>

            <div className="mt-4">
              <button className="btn btn-primary" disabled={!step1Valid} onClick={()=>setStarted(true)}>Comenzar captura</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Paso 2 ===== */}
      {started && (
        <>
          {/* Datos generales */}
          <div className="card shadow-sm mb-4">
            <div className="card-header">Datos de la Devolución</div>
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
              </div>
            </div>
          </div>

          {/* Tabla de piezas devueltas */}
          <div className="card shadow-sm mb-4">
            <div className="card-header">Piezas devueltas (reingresan al inventario)</div>
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
                          <td><button className="btn btn-sm btn-outline-danger" type="button" onClick={()=>del(i)}>Quitar</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="table-light">
                    <tr>
                      <th colSpan={7}>Totales</th>
                      <th className="text-end">{fmx.format(totales.subtotal)}</th>
                      <th className="text-end">{fmx.format(totales.iva)}</th>
                      <th className="text-end">{fmx.format(totales.total)}</th>
                      <th colSpan={2}></th>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="d-flex gap-2">
                <button className="btn btn-secondary" type="button" onClick={add}>Agregar renglón</button>
                <button className="btn btn-outline-dark" type="button" onClick={()=>setStarted(false)}>Volver</button>
                <button className="btn btn-primary" type="button" disabled={sending} onClick={generarVale}>
                  {sending ? "Generando…" : "Guardar devolución y generar Vale"}
                </button>
              </div>
            </div>
          </div>

          {/* Panel del Vale generado */}
          {vale && (
            <div className="card shadow-sm">
              <div className="card-header">Vale generado</div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label">Código</label>
                    <div className="input-group">
                      <input className="form-control" value={vale.codigo} readOnly />
                      <button className="btn btn-outline-secondary" type="button" onClick={()=>copy(vale.codigo)}>Copiar</button>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Monto</label>
                    <input className="form-control" value={fmx.format(vale.monto)} readOnly />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Saldo</label>
                    <input className="form-control" value={fmx.format(vale.saldo)} readOnly />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Estado</label>
                    <input className="form-control" value={vale.estado} readOnly />
                  </div>
                </div>

                <div className="mt-3 d-flex gap-2">
                  {/* Aquí podrías abrir impresión del comprobante */}
                  <button className="btn btn-success" type="button" onClick={finalizar}>Finalizar Devolución</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
