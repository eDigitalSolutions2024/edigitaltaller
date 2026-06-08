  import { useEffect, useMemo, useState } from "react";
  import { getUnidadesMedida } from "../../../api/configuracion";
  import ModalAltaCodigo from "./ModalAltaCodigo";


  /**
   * Tabla de captura para la Entrada de Inventario.
   * Props:
   *  - entradaId: id/folio de la entrada para asociar los renglones en el backend
   */
  export default function TablaCapturaEntrada({ entradaId }) {
    const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

    const [codigos, setCodigos] = useState([]);
    const [rows, setRows] = useState([nuevaFila()]);
    const [guardando, setGuardando] = useState(false);
    const [unidades, setUnidades] = useState([]);

    const [showModalCodigo, setShowModalCodigo] = useState(false);
    const [filaModalCodigo, setFilaModalCodigo] = useState(null);

    // Cargar unidades de medida activas desde Configuración
    useEffect(() => {
      getUnidadesMedida()
        .then(data => setUnidades((data || []).filter(u => u.activo)))
        .catch(() => setUnidades([]));
    }, []);
    const tipos = ["Refacción", "Insumo", "Servicio"];
    const ivaCatalog = [
      { label: "0%", value: 0 },
      { label: "8%", value: 0.08 },
      { label: "16%", value: 0.16 },
    ];

    useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/codigos`, { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message || "Error");
        setCodigos(j?.data || j || []);
      } catch {
        setCodigos([]);
      }
    })();
  }, []);

    const totalGeneral = useMemo(
      () => rows.reduce((acc, r) => acc + calcTotalLinea(r), 0),
      [rows]
    );

    function nuevaFila() {
      return {
        cantidad: "",
        unidad: "",
        tipo: "",
        codigoInterno: "",     // _id de BDCodigos
        // codigoProveedor:  // ❌ eliminado
        marca: "",
        subtotalUnitario: "",
        iva: 0.16,
        total: 0,
        costoDescuento: "",
        // pvUnitario: "",   // ❌ eliminado
        // pvPesos: "",      // ❌ eliminado
        //ordenServicio: "",
        descripcion: "",
      };
    }

    function handleChange(i, campo, valor) {
      setRows(prev => {
        const copia = [...prev];
        copia[i] = { ...copia[i], [campo]: valor };
        if (["cantidad", "subtotalUnitario", "iva", "costoDescuento"].includes(campo)) {
          copia[i].total = calcTotalLinea(copia[i]);
        }
        return copia;
      });
    }

    function calcTotalLinea(r) {
      const qty   = toNum(r.cantidad);
      const unit  = toNum(r.subtotalUnitario);
      const iva   = Number(r.iva) || 0;
      const desc  = toNum(r.costoDescuento);

      const subtotal = qty * unit;
      const subtotalConDescuento = subtotal - desc;

      const total = subtotalConDescuento * (1 + iva);

      return total > 0 ? total : 0;
    }

    function toNum(v) {
      const n = parseFloat(String(v ?? "").replace(/,/g, "."));
      return Number.isFinite(n) ? n : 0;
    }

    function calcTotalSinIva(r) {
      const qty  = toNum(r.cantidad);
      const unit = toNum(r.subtotalUnitario);
      const desc = toNum(r.costoDescuento);

      const total = (qty * unit) - desc;

      return total > 0 ? total : 0;
    }

    function addRow() {
      setRows(prev => [...prev, nuevaFila()]);
    }

    function removeRow(i) {
      setRows(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
    }

    // selección de código del catálogo
    function onSelectProducto(i, valor) {
      const prod = codigos.find((p) => p._id === valor);
      setRows((prev) => {
        const copia = [...prev];
        copia[i] = {
          ...copia[i],
          codigoInterno: valor,
          marca: prod?.proveedor || "",           // ✅ proveedor como marca, no el label
          descripcion: prod?.descripcion || "",   // ✅ descripción directa
        };
        return copia;
      });
    }

    const handleCodigoCreado = (nuevoCodigo) => {
      // ✅ Mapea al mismo formato que el fetch de /codigos
      const nuevoItem = {
        _id: nuevoCodigo._id,
        numeroParte: nuevoCodigo.numeroParte || nuevoCodigo.codigo || "",
        descripcion: nuevoCodigo.descripcion || "",
        proveedor: nuevoCodigo.proveedor || "",
        tipo: nuevoCodigo.tipo || "refaccion",
      };
      setCodigos((prev) => [...prev, nuevoItem]);

      if (filaModalCodigo !== null) {
        onSelectProducto(filaModalCodigo, nuevoCodigo._id);
      }
      setShowModalCodigo(false);
      setFilaModalCodigo(null);
    };

    async function guardar() {
      if (!entradaId) {
        alert("Primero crea la entrada (folio) en el formulario superior.");
        return;
      }

      const detalle = rows
        .map(r => ({
          ...r,
          cantidad: toNum(r.cantidad),
          subtotalUnitario: toNum(r.subtotalUnitario),
          costoDescuento: toNum(r.costoDescuento),
          iva: Number(r.iva) || 0,
          total: calcTotalLinea(r),
        }))
        .filter(r => r.cantidad > 0 && r.subtotalUnitario > 0 && r.codigoInterno);

      if (detalle.length === 0) {
        alert("Agrega al menos un renglón con código interno, cantidad y subtotal unitario.");
        return;
      }

      try {
        setGuardando(true);

        for (const r of detalle) {
          const ivaPct = (r.iva <= 1 ? r.iva * 100 : r.iva);
          const base = r.cantidad * r.subtotalUnitario || 0;
          const descuentoPct = base > 0 ? (r.costoDescuento / base) * 100 : 0;

          const payload = {
            codigoInterno: r.codigoInterno,      // _id de BDCodigos
            descripcion: r.descripcion,
            tipo: r.tipo || "Refacción",
            unidad: r.unidad || "Pieza",
            cantidad: r.cantidad,
            costoUnitario: r.subtotalUnitario,
            ivaPct,
            descuentoPct,
            // codigoProveedor: r.codigoProveedor, // ❌ eliminado
            marca: r.marca,
            // pvUnitario: r.pvUnitario,           // ❌ eliminado
            // pvPesos: r.pvPesos,                 // ❌ eliminado
            //ordenServicio: r.ordenServicio,
            total: r.total,
          };

          const resp = await fetch(`${API}/entradas/${entradaId}/captura`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });
          if (!resp.ok) {
            const msg = await safeMsg(resp);
            throw new Error(msg || "Error al guardar un renglón de captura");
          }
        }

        await fetch(
          `${API}/entradas/${entradaId}/finalizar`,
          {
            method: "PATCH",
            credentials: "include"
          }
        );

        alert("¡Captura guardada correctamente!");
        window.location.reload();
        
        setRows([nuevaFila()]);
      } catch (e) {
        console.error(e);
        alert(e.message || "Error al guardar la captura.");
      } finally {
        setGuardando(false);
      }

      
      
    }

    return (
      <div className="card border-0 shadow-sm mt-3">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th style={{minWidth:90}}>Cantidad</th>
                <th style={{minWidth:140}}>Unidad de Medida</th>
                <th style={{minWidth:130}}>Tipo</th>
                <th style={{minWidth:220}}>Código Interno</th>
                {/* <th style={{minWidth:150}}>Código Proveedor</th>  ❌ */}
                <th style={{minWidth:140}}>Marca</th>
                <th style={{minWidth:150}}>SubTotal Unitario</th>
                <th style={{minWidth:100}}>IVA</th>
                <th style={{minWidth:150}}>Total sin IVA</th>
                <th style={{minWidth:150}}>Total con IVA</th>
                <th style={{minWidth:150}}>Costo Descuento</th>
                {/* <th style={{minWidth:170}}>P.Venta Refa Unitario</th>  ❌ */}
                {/* <th style={{minWidth:170}}>P.Venta Refa Pesos</th>    ❌ */}
                {/*<th style={{minWidth:160}}>Orden Servicio</th>❌ */}
                <th style={{minWidth:110}}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="number" min="0" step="any" className="form-control"
                      value={r.cantidad}
                      onChange={(e) => handleChange(i, "cantidad", e.target.value)}
                    />
                  </td>

                  <td>
                    <select
                      className="form-select"
                      value={r.unidad}
                      onChange={(e) => handleChange(i, "unidad", e.target.value)}
                      disabled={unidades.length === 0}
                    >
                      {unidades.length === 0
                        ? <option value="">No hay unidades capturadas</option>
                        : <>
                            <option value="">Selecciona unidad</option>
                            {unidades.map(u => (
                              <option key={u._id} value={u.nombre}>{u.nombre}</option>
                            ))}
                          </>
                      }
                    </select>
                  </td>

                  <td>
                    <select
                      className="form-select"
                      value={r.tipo}
                      onChange={(e) => handleChange(i, "tipo", e.target.value)}
                    >
                      <option value="">Select...</option>
                      {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>

                  {/* CÓDIGO INTERNO (BDCodigos) */}
                  <td>
                    <select
                      className="form-select"
                      value={r.codigoInterno}
                      onChange={(e) => {
                        if (e.target.value === "__nuevo__") {
                          setShowModalCodigo(true);
                          setFilaModalCodigo(i); // ← para saber qué fila actualizar
                          return;
                        }
                        onSelectProducto(i, e.target.value);
                      }}
                    >
                      <option value="">Select an Option</option>
                      {codigos.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.numeroParte || p.codigo} — {p.descripcion || ""}
                        </option>
                      ))}
                      <option value="__nuevo__">➕ Dar de alta nuevo código...</option>
                    </select>
                  </td>

                  {/* Código Proveedor ❌ eliminado */}

                  <td>
                    <input
                      type="text" className="form-control"
                      value={r.marca}
                      onChange={(e) => handleChange(i, "marca", e.target.value)}
                    />
                  </td>

                  <td>
                    <input
                      type="number" min="0" step="any" className="form-control"
                      value={r.subtotalUnitario}
                      onChange={(e) => handleChange(i, "subtotalUnitario", e.target.value)}
                    />
                  </td>

                  <td>
                    <select
                      className="form-select"
                      value={r.iva}
                      onChange={(e) => handleChange(i, "iva", e.target.value)}
                    >
                      {ivaCatalog.map(v => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <input
                      type="text"
                      className="form-control"
                      value={formatCurrency(calcTotalSinIva(r))}
                      readOnly
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      className="form-control"
                      value={formatCurrency(calcTotalLinea(r))}
                      readOnly
                    />
                  </td>

                  <td>
                    <input
                      type="number" min="0" step="any" className="form-control"
                      value={r.costoDescuento}
                      onChange={(e) => handleChange(i, "costoDescuento", e.target.value)}
                    />
                  </td>

                  {/* P. Venta Unitario / Pesos ❌ eliminados */}
                {/* 
                  <td>
                    <input
                      type="text" className="form-control"
                      value={r.ordenServicio}
                      onChange={(e) => handleChange(i, "ordenServicio", e.target.value)}
                    />
                  </td>*/}

                  <td className="text-nowrap">
                    <button type="button" className="btn btn-outline-primary btn-sm me-2" onClick={addRow}>＋</button>
                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => removeRow(i)}>—</button>
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                {/* Antes era 8; ahora hay 7 columnas antes del Total */}
                <td colSpan={8} />
                <td><div className="fw-semibold">{formatCurrency(totalGeneral)}</div></td>
                {/* Después del Total quedan 3 columnas (Costo desc, OS, Acción) */}
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="card-footer bg-white d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-primary" disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando..." : "Finalizar Captura"}
          </button>
        </div>

        {showModalCodigo && (
          <ModalAltaCodigo
            onCodigoCreado={handleCodigoCreado}
            onClose={() => {
              setShowModalCodigo(false);
              setFilaModalCodigo(null);
            }}
          />
        )}
      </div>
    );
  }

  function formatCurrency(n) {
    try {
      return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    } catch {
      return `$${(n || 0).toFixed(2)}`;
    }
  }

  async function safeMsg(resp) {
    try { const j = await resp.json(); return j?.message || j?.error; } catch { return ''; }
  }
