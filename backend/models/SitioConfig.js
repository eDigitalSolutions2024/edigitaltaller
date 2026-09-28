const mongoose = require('mongoose');

// Datos del sitio/sucursal que se imprimen en reportes y documentos (no son
// datos fiscales: para eso existe FiscalConfig). Se guardan por separado
// porque, al manejar varias sucursales, cada instalación va a tener su
// propio nombre, dirección, teléfono y si es matriz o no.
//
// Defaults = los valores que hasta ahora estaban fijos en el código (mismos
// que ya se imprimían en reportes, orden de compra, vale de salida, etc.),
// para que la primera consulta no cambie nada visualmente hasta que un
// admin edite la configuración.
const NOMBRE_DEFAULT = 'SERVICOMPACTOS DE JUAREZ';
// Línea usada en encabezados de reportes (una sola línea, calle + colonia).
const DIRECCION_CORTA_DEFAULT = 'PASEO TRIUNFO DE LA REPÚBLICA #322  SAN LORENZO';
// Dos líneas usadas en documentos (orden de compra, vale de salida,
// presupuestos, factura): calle/número y colonia+CP+ciudad+estado.
const DIRECCION_LINEA1_DEFAULT = 'PASEO TRIUNFO DE LA REPÚBLICA #322-B';
const DIRECCION_LINEA2_DEFAULT = 'COL. SAN LORENZO, C.P. 32320, CD. JUÁREZ, CHIH.';
const TELEFONO_DEFAULT = '(656) 626-5651 AL 54';

const SitioConfigSchema = new mongoose.Schema(
  {
    nombre: { type: String, default: NOMBRE_DEFAULT, trim: true },
    direccionCorta: { type: String, default: DIRECCION_CORTA_DEFAULT, trim: true },
    direccionLinea1: { type: String, default: DIRECCION_LINEA1_DEFAULT, trim: true },
    direccionLinea2: { type: String, default: DIRECCION_LINEA2_DEFAULT, trim: true },
    telefono: { type: String, default: TELEFONO_DEFAULT, trim: true },
    // Si es falso, los reportes de Facturas y Remisiones del día ya no
    // imprimen la etiqueta "Matriz" (para sucursales que no lo son).
    esMatriz: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Documento único (singleton): si no existe todavía se crea con los
// valores por defecto la primera vez que se consulta.
SitioConfigSchema.statics.getOrCreate = async function () {
  let doc = await this.findOne().sort({ createdAt: -1 });
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('SitioConfig', SitioConfigSchema);
