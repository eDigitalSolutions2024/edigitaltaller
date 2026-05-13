// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: { type: String, required: true, minlength: 6 },

    role: {
      type: String,
      enum: [
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
        'recursos_humanos'
      ],
      default: 'captura'
    },

    legacyLevel: {
      type: String,
      default: null
    },

    razonSocial: {
      type: Number,
      default: null
    },

    telefono: {
      type: String,
      trim: true,
      default: ''
    },

    celular: {
      type: String,
      trim: true,
      default: ''
    },

    serie: {
      type: String,
      trim: true,
      default: ''
    },

    serieLlantera: {
      type: String,
      trim: true,
      default: 'L'
    },

    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Empleado',
      default: null
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);