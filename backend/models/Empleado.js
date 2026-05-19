// models/Empleado.js
const mongoose = require('mongoose');

const empleadoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },

    puesto: {
      type: String,
      enum: [
        'asesor',
        'mecanico',
        'ayudante',
        'recepcion',
        'contabilidad',
        'jefe_taller',
        'jefe',      // por si coincide con el jefe del taller
        'otro'
      ],
      default: 'otro'
    },

    telefono: { type: String, trim: true },
    correo: { type: String, trim: true },

    fechaAlta: { type: Date, default: Date.now },

    activo: { type: Boolean, default: true },

    // Relación opcional con un usuario del sistema
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null
    },

    notas: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Empleado', empleadoSchema);
