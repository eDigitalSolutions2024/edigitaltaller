// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

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
        'admin',       // administrador / jefe
        'staff',       // genérico
        'mecanico',
        'recepcion',
        'contabilidad',
        'consulta'
      ],
      default: 'admin'
    },

    // más adelante lo puedes ligar a Empleado
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
