require("dotenv").config();
const mongoose = require("mongoose");
const Codigo = require("../models/Codigo");

const servicios = [
  { codigo: "S1", descripcion: "Afinación", tipo: "servicio", grupoServicio: "mantenimiento" },
  { codigo: "S2", descripcion: "Limpieza de inyectores", tipo: "servicio", grupoServicio: "mantenimiento" },
  { codigo: "S3", descripcion: "Limpieza del cuerpo de aceleración", tipo: "servicio", grupoServicio: "mantenimiento" },
  { codigo: "S4", descripcion: "Lubricación", tipo: "servicio", grupoServicio: "mantenimiento" },
  { codigo: "S5", descripcion: "Cambio de aceite", tipo: "servicio", grupoServicio: "mantenimiento" },
  { codigo: "S6", descripcion: "Engrasado", tipo: "servicio", grupoServicio: "mantenimiento" },
  { codigo: "S7", descripcion: "Revisión de niveles de fluidos", tipo: "servicio", grupoServicio: "mantenimiento" },
  { codigo: "S8", descripcion: "Lubricación de bisagras", tipo: "servicio", grupoServicio: "mantenimiento" },
  { codigo: "S9", descripcion: "Lubricar suspensión y dirección", tipo: "servicio", grupoServicio: "mantenimiento" },
  { codigo: "S10", descripcion: "Revisión", tipo: "servicio", grupoServicio: "revision" },
  { codigo: "S11", descripcion: "Revisión para carretera", tipo: "servicio", grupoServicio: "revision" },
  { codigo: "S12", descripcion: "Diagnóstico de compra", tipo: "servicio", grupoServicio: "revision" },
  { codigo: "S13", descripcion: "Otros servicios", tipo: "servicio", grupoServicio: "otros" },
  { codigo: "S14", descripcion: "Alineación por computadora", tipo: "servicio", grupoServicio: "otros" },
  { codigo: "S15", descripcion: "Balanceo en las 4 ruedas", tipo: "servicio", grupoServicio: "otros" },
  { codigo: "S16", descripcion: "Reemplazo de balatas en las 4 ruedas", tipo: "servicio", grupoServicio: "otros" },
  { codigo: "S17", descripcion: "Recarga de gas freón", tipo: "servicio", grupoServicio: "otros" },
  { codigo: "S18", descripcion: "Servicio anticongelante y termostato", tipo: "servicio", grupoServicio: "otros" },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB conectado");

    for (const servicio of servicios) {
      await Codigo.findOneAndUpdate(
        { codigo: servicio.codigo, tipo: "servicio" },
        servicio,
        { upsert: true, new: true }
      );
    }

    console.log("Servicios de taller insertados/actualizados correctamente");
    process.exit(0);
  } catch (error) {
    console.error("Error insertando servicios:", error);
    process.exit(1);
  }
}

seed();