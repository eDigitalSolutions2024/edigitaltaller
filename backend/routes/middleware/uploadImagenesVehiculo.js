const multer = require("multer");
const path = require("path");
const fs = require("fs");

const PERM_DIR = path.join(__dirname, "..", "..", "uploads", "vehiculos");
const TEMP_DIR = path.join(PERM_DIR, "temp");

function crearUpload(getDestino) {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      const dest = getDestino(req);
      fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    },

    filename(req, file, cb) {
      const unique =
        Date.now() + "-" + Math.round(Math.random() * 1e9);

      cb(
        null,
        unique + path.extname(file.originalname)
      );
    }
  });

  const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Solo se permiten archivos de imagen"
        )
      );
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 15 * 1024 * 1024, // 15MB por imagen
      files: 10,
    }
  });
}

// Imágenes ya asociadas a una orden existente
const uploadImagenesVehiculo = crearUpload(() => PERM_DIR);

// Imágenes subidas antes de que la orden exista (modo creación): se guardan
// en una carpeta temporal por tempId y se mueven a PERM_DIR cuando la orden
// se crea; si la orden nunca se crea, un job de limpieza las purga.
const uploadImagenesVehiculoTemp = crearUpload((req) => path.join(TEMP_DIR, req.params.tempId));

module.exports = {
  uploadImagenesVehiculo,
  uploadImagenesVehiculoTemp,
  PERM_DIR,
  TEMP_DIR,
};
