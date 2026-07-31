const fs = require('fs');
const path = require('path');

const TEMP_DIR = path.join(__dirname, '..', 'uploads', 'vehiculos', 'temp');
const MAX_EDAD_MS = 24 * 60 * 60 * 1000; // 24 horas

// Borra carpetas de imágenes subidas antes de guardar una orden nueva que
// nunca se llegó a crear (o que se abandonó a medio capturar). Se identifican
// por antigüedad: si la orden se hubiera guardado, la carpeta ya habría sido
// migrada y eliminada por POST /api/vehiculos.
function limpiarImagenesTemp() {
  fs.readdir(TEMP_DIR, (err, carpetas) => {
    if (err) return; // aún no existe ninguna carpeta temporal

    const ahora = Date.now();
    carpetas.forEach((carpeta) => {
      const dir = path.join(TEMP_DIR, carpeta);
      fs.stat(dir, (errStat, stats) => {
        if (errStat || !stats.isDirectory()) return;
        if (ahora - stats.mtimeMs > MAX_EDAD_MS) {
          fs.rm(dir, { recursive: true, force: true }, () => {});
        }
      });
    });
  });
}

module.exports = limpiarImagenesTemp;
