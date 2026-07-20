// Las fechas "solo día" (capturadas con <input type="date">, p. ej.
// fechaRecepcion o los filtros desde/hasta) se guardan como medianoche UTC.
// dayjs las formatea en la hora local del servidor y las corre un día hacia
// atrás, así que se re-parsean desde su componente de fecha UTC. Los
// timestamps reales se formatean normal.
const dayjs = require('dayjs');

function esFechaSoloDia(valor) {
  if (typeof valor === 'string') {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(valor) ||
      /T00:00:00(\.000)?Z$/.test(valor) ||
      /T23:59:59\.999Z$/.test(valor)
    );
  }
  return valor instanceof Date && valor.getTime() % 86400000 === 0;
}

// dayjs con la fecha correcta para formatear (sin corrimiento de día)
function dayjsFecha(valor) {
  if (esFechaSoloDia(valor)) {
    return dayjs(new Date(valor).toISOString().slice(0, 10));
  }
  return dayjs(valor);
}

module.exports = { esFechaSoloDia, dayjsFecha };
