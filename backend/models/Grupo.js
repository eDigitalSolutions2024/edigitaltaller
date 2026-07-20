// backend/models/Grupo.js
const mongoose = require('mongoose');

const ROLES = [
  'admin',
  'mecanico',
  'recepcion',
  'cajas',
  'captura',
  'refaccionario',
  'asesor_servicio',
  'cuentas_por_pagar',
  'auditoria',
  'cuentas_por_cobrar',
  'recursos_humanos',
  'coordinador',
  'finanzas'
];

const grupoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },

    rol: {
      type: String,
      required: true,
      enum: ROLES
    },

    // Roster vigente del grupo (a quién se le asignan las órdenes nuevas).
    miembros: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Todos los que alguna vez pertenecieron al grupo. Nunca se les quita de
    // aquí (ni al salir del grupo ni al desactivarlo) para que conserven
    // acceso permanente a las órdenes que se trabajaron en conjunto.
    historialMiembros: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    activo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Grupo', grupoSchema);
