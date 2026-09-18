const mongoose = require('mongoose');

// Congela el resultado de un Reporte Diario de Ingresos (Remisiones o
// Facturas) de UN DÍA que ya terminó (nunca "hoy"), la primera vez que se
// pide — ver reporteDiaConCache en routes/reportes.js. Sin esto, el reporte
// de un día se recalcula en vivo cada vez que se abre, así que algo que pasa
// un día DESPUÉS (p. ej. se cancela una remisión al día siguiente) termina
// corrigiendo retroactivamente el reporte del día en que se creó — aunque ese
// día ya "cerró" tal como se vio entonces. Con el snapshot, el día 14 se
// queda como se vio el día 14; la cancelación del día 15 aparece en el
// reporte del día 15.
const reporteCajasSnapshotSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ['REMISION', 'NOTA_VENTA'], required: true },
    // Día local del taller en formato YYYY-MM-DD (mismo criterio que
    // dayjsFecha). Único junto con `tipo`: como mucho un snapshot por día.
    diaKey: { type: String, required: true },
    desde: { type: Date, required: true },
    hasta: { type: Date, required: true },
    // Resultado completo de buildReporteRemisionesDiario/buildReporteFacturasDiario
    // tal como se sirvió la primera vez (misma forma que devuelven esas
    // funciones), para servirlo idéntico en cualquier consulta posterior.
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    generadoEn: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

reporteCajasSnapshotSchema.index({ tipo: 1, diaKey: 1 }, { unique: true });

module.exports = mongoose.model('ReporteCajasSnapshot', reporteCajasSnapshotSchema);
