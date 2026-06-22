// backend/models/Vehiculo.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// al inicio, antes del schema:
const ESTADOS_ORDEN = [
  'PENDIENTE_CAPTURA',
  'PENDIENTE_REFACCIONARIA',
  'PENDIENTE_AUTORIZACION_CLIENTE',
  'PENDIENTE_SURTIR',
  'PENDIENTE_CIERRE',
  'REPARACION_EN_CURSO',
  'CALIDAD',
  'PENDIENTE_CERRAR',
  'CERRADA',
];

const vehiculoSchema = new Schema(
  {
    
    // Referencia al cliente dueño del vehículo
    cliente: {
      type: Schema.Types.ObjectId,
      ref: 'Cliente',
      required: true,
    },

    // NUEVO: estado de la orden
    estadoOrden: {
      type: String,
      enum: ESTADOS_ORDEN,
      default: 'PENDIENTE_CAPTURA',
      index: true,
    },

    fechaSolicitudRefacciones: { type: Date, default: null },
    fechaRespuestaRefaccionaria: { type: Date, default: null },
    fechaEnvioSurtir: { type: Date, default: null },
    creadoPor: { type: String, default: "" },
    devueltoPor: { type: String, default: "" },

    //---- FECHA DE CIERRE -----
    fechaCierre:{ type: Date, default: null},


    // ----- Datos de Orden / cabecera -----
    ordenServicio: String,
    fechaRecepcion: Date,
    horaRecepcion: String,


    // Presupuesto
    dirigidoA: { type: String, default: "" },
    departamento: { type: String, default: "" },
    observCotizacion: { type: String, default: "" },
    requiereFactura: { type: Boolean, default: false },

    // ----- Datos de vehículo -----
    nombreUsuarioDejaVehiculo: String,
    marca: String,
    modelo: String,
    anio: String,
    color: String,
    serie: String,
    placas: String,
    kmsMillas: String,
    nacionalidad: String,
    motor: String,
    numeroEconomico: String,
    traccion: String,

    // ----- Inspección física al recibir el vehículo -----
    inspeccionFisica: {
      // Accesorios / checkboxes
      grua: { type: String, default: "" },
      precioGrua: { type: Number, default: 0 },
      espejoLateralIzq: { type: Boolean, default: false },
      espejoLateralDer: { type: Boolean, default: false },
      copasDelanterasIzq: { type: Boolean, default: false },
      copasDelanterasDer: { type: Boolean, default: false },
      parabrisas: { type: String, default: "" },
      focosDel: { type: Boolean, default: false },
      focosTras: { type: Boolean, default: false },
      espejoInt: { type: Boolean, default: false },
      tapetesDelanterosIzq: { type: Boolean, default: false },
      tapetesDelanterosDer: { type: Boolean, default: false },
      estereo: { type: Boolean, default: false },
      extra: { type: Boolean, default: false },
      copasTraserasIzq: { type: Boolean, default: false },
      copasTraserasDer: { type: Boolean, default: false },
      micas: { type: Boolean, default: false },
      antena: { type: Boolean, default: false },
      encendedor: { type: Boolean, default: false },
      tapetesTraserosIzq: { type: Boolean, default: false },
      tapetesTraserosDer: { type: Boolean, default: false },
      gato: { type: Boolean, default: false },
      bateria: { type: Boolean, default: false },
      nivelGasolina: { type: String, default: null },
      danoVehiculo: { type: String, default: null },
      // Indicadores tablero / mecánicos
      checkEngine: { type: String, default: "" },
      abs: { type: String, default: "" },
      airBag: { type: String, default: "" },
      frenos: { type: String, default: "" },
      aceite: { type: String, default: "" },
      alternador: { type: String, default: "" },
      indicadoresTablero: { type: String, default: "" },
      otros: { type: String, default: "" },
      observaciones: { type: String, default: "" },
    },

   // ===== Servicio o Reparación =====
  servicioReparacion: {
    serviciosSeleccionados: [{ type: String }],

    mantenimientoMotor: {
      afinacion: { type: Boolean, default: false },
      limpiezaInyectores: { type: Boolean, default: false },
      limpiezaCuerpoAceleracion: { type: Boolean, default: false },
      lubricacion: { type: Boolean, default: false },
      cambioAceite: { type: Boolean, default: false },
      engrase: { type: Boolean, default: false },
      revisionNivelesFluidos: { type: Boolean, default: false },
      lubricacionBisagras: { type: Boolean, default: false },
      lubricarSuspensionDireccion: { type: Boolean, default: false },
      revisionCarretera: { type: Boolean, default: false },
      diagnosticoCompra: { type: Boolean, default: false },
      otrosServicios: { type: Boolean, default: false },
      alineacionComputadora: { type: Boolean, default: false },
      balanceo4Ruedas: { type: Boolean, default: false },
      reemplazoBalatas4Ruedas: { type: Boolean, default: false },
      recargaGasAC: { type: Boolean, default: false },
      servicioCoolingTermostato: { type: Boolean, default: false },
    },

    fallasReportadasCliente: { type: String, default: "" },

    sintomas: {
      noEnciende: { type: Boolean, default: false },
      tardaEncenderFrio: { type: Boolean, default: false },
      tardaEncenderCaliente: { type: Boolean, default: false },
      cascabelea: { type: Boolean, default: false },
      motorTembloroso: { type: Boolean, default: false },
      faltaPotencia: { type: Boolean, default: false },
      hechaHumo: { type: Boolean, default: false },
      humoColor: { type: String, default: "" },
    },

    indicadoresTableroServicio: {
      checkEngine: { type: Boolean, default: false },
      abs: { type: Boolean, default: false },
      airBag: { type: Boolean, default: false },
      frenos: { type: Boolean, default: false },
      aceite: { type: Boolean, default: false },
      alternador: { type: Boolean, default: false },
      otros: { type: String, default: "" },
    },

    fallasMotorOtros: { type: String, default: "" },
    precioFallasMotorOtros: { type: Number, default: 0 },

    sistemaElectricoAire: { type: String, default: "" },
    precioSistemaElectricoAire: { type: Number, default: 0 },

    suspensionDireccionFrenos: { type: String, default: "" },
    precioSuspensionDireccionFrenos: { type: Number, default: 0 },

    sistemaEnfriamiento: { type: String, default: "" },
    precioSistemaEnfriamiento: { type: Number, default: 0 },

    infoLlantas: { type: String, default: "" },
    revisionFallas: { type: String, default: "" },
  },

    // indica si la orden ya fue “iniciada” desde Servicio/Reparación
    ordenIniciada: {
      type: Boolean,
      default: false,
    },

    // ===== Requisición y diagnóstico =====
    diagnosticoTecnico: { type: String, default: "" },

    refaccionesSolicitadas: [
      {
        // Campos propios de la solicitud (no se duplican en opciones)
        cant: { type: Number, default: 0 },
        refaccion: { type: String, default: "" },

        // Índice de la opción elegida por el asesor (null = sin selección)
        opcionSeleccionada: { type: Number, default: null },

        // Cotizaciones de refaccionaria para esta refacción
        opciones: [
          {
            unidad: { type: String, default: "" },
            tipo: { type: String, default: "" },
            marca: { type: String, default: "" },
            proveedor: { type: String, default: "" },
            codigo: { type: String, default: "" },
            precioUnitario: { type: Number, default: 0 },
            importeTotal: { type: Number, default: 0 },
            moneda: { type: String, default: "MN" },
            tipoCambio: { type: Number, default: 0 },
            tiempoEntrega: { type: String, default: "" },
            core: { type: String, default: "" },
            precioCore: { type: Number, default: 0 },
            observaciones: { type: String, default: "" },
          },
        ],

        estatus: {
          type: String,
          enum: ['PENDIENTE', 'APROBADA', 'RECHAZADA'],
          default: 'PENDIENTE',
        },


// 👇👇 NUEVOS CAMPOS PARA ORDEN DE COMPRA
        requiereOC: { type: Boolean, default: false },   // el checkbox del mecánico
        ocGenerada: { type: Boolean, default: false },   // ya se generó al menos una OC
        numeroOC:   { type: String,  default: null },    // folio de la OC principal
        ordenCompra: {
          type: Schema.Types.ObjectId,
          ref: 'OrdenCompra',
          default: null,
        },
      },
    ],

    // ===== Cargos en orden =====
    cargosEnOrden: [
      {
        cant: { type: Number, default: 0 },
        unidad: { type: String, default: "" },
        concepto: { type: String, default: "" }, // “Refacción y/o Servicio”
        marca: { type: String, default: "" },
        proveedor: { type: String, default: "" },
        codigo: { type: String, default: "" },
        precioUnitario: { type: Number, default: 0 },
        importeTotal: { type: Number, default: 0 },
        moneda: { type: String, default: "MN" },
        observaciones: { type: String, default: "" },
        documento: { type: String, default: "" }, // p.ej. factura ligada
      },
    ],

    // ===== Historial de cotizaciones =====
    historialCotizaciones: [
      {
        folio: String,
        fecha: Date,
        estado: String,
        dirigidoA: String,
        departamento: String,
        observCotizacion: String,
        partidas: []
      }
    ],

    // ===== Historial de venta al cliente =====
    historialVentaCliente: [
      {
        folio: { type: String, default: "" },
        fecha: { type: Date, default: Date.now },

        estado: {
          type: String,
          enum: [
            "BORRADOR",
            "ENVIADA",
            "PARCIALMENTE_AUTORIZADA",
            "AUTORIZADA",
            "NO_AUTORIZADA",
            "PENDIENTE",
            "REACTIVADA",
            "VENDIDA",
          ],
          default: "BORRADOR",
        },

        dirigidoA: { type: String, default: "" },
        departamento: { type: String, default: "" },
        observCotizacion: { type: String, default: "" },

        partidas: [
          {
            cant: { type: Number, default: 0 },
            concepto: { type: String, default: "" },
            refaccion: { type: String, default: "" },
            tipo: { type: String, default: "" },
            marca: { type: String, default: "" },
            proveedor: { type: String, default: "" },
            codigo: { type: String, default: "" },

            precioCompra: { type: Number, default: 0 },
            precioOriginal: { type: Number, default: 0 },
            moneda: { type: String, default: "MN" },
            tipoCambio: { type: Number, default: 0 },

            tiempoEntrega: { type: String, default: "" },
            horasMO: { type: Number, default: 0 },
            precioVenta: { type: Number, default: 0 },
            observInt: { type: String, default: "" },

            estatusCliente: {
              type: String,
              enum: [
                "COTIZADA",
                "AUTORIZADA",
                "NO_AUTORIZADA",
                "PENDIENTE",
                "REACTIVADA",
                "VENDIDA",
              ],
              default: "COTIZADA",
            },

            origenPresupuestoIndex: { type: Number, default: null },
          },
        ],
      },
    ],


    // ===== Presupuesto (refacciones autorizadas) =====
    presupuesto: [
      {
        cant: { type: Number, default: 0 },
        concepto: { type: String, default: "" },
        refaccion: { type: String, default: "" },
        tipo: { type: String, default: "" },
        marca: { type: String, default: "" },
        proveedor: { type: String, default: "" },
        codigo: { type: String, default: "" },
        precioCompra: { type: Number, default: 0 },
        tiempoEntrega: { type: String, default: "" },
        horasMO: { type: Number, default: 0 },
        precioVenta: { type: Number, default: 0 },
        observInt: { type: String, default: "" },
        estatusCotizacion: {
          type: String,
          enum: [
            "COTIZADA",
            "PENDIENTE_CLIENTE",
            "AUTORIZADA",
            "RECHAZADA",
            "EJECUTADA",
            "REACTIVADA",
          ],
          default: "COTIZADA",
        },
        estatusCliente: {
          type: String,
          enum: [
            "COTIZADA",
            "AUTORIZADA",
            "NO_AUTORIZADA",
            "PENDIENTE",
            "REACTIVADA",
            "VENDIDA",
          ],
          default: "COTIZADA",
        },
        autorizado: { type: Boolean, default: false }, // ← asesor marcó ✓
        surtida: { type: Boolean, default: false },     // ← refaccionaria surtió
      },
    ],

    // ===== Venta al Cliente (cierre) =====
    ventaCliente: [
      {
        cant: { type: Number, default: 0 },
        concepto: { type: String, default: "" },
        precioVenta: { type: Number, default: 0 },
        observaciones: { type: String, default: "" },
        autorizacionCliente: {
          type: String,
          enum: ["SI", "NO", "PENDIENTE"],
          default: "SI",
        },
        codigoServicio: { type: String, default: "" },
        descripcionServicio: { type: String, default: "" },
        codigoSat: { type: String, default: "" },
        descripcionSat: { type: String, default: "" },
      },
    ],

    // ===== Mano de Obra =====
    manoObra: [
      {
        concepto: { type: String, default: "" },
        mecanico: { type: String, default: "" },
        horas: { type: Number, default: 0 },
        fechaPago: { type: String, default: "" },
        observaciones: { type: String, default: "" },

        // ← nuevos
        esCarroceria:     { type: Boolean, default: false },
        carrocero:        { type: String, default: "" },
        precioCarroceria: { type: Number, default: 0 },
      },
    ],

// ===== Observaciones finales =====
observacionesExternas: { type: String, default: "" },
observacionesInternas: { type: String, default: "" },
// ===== Control de cierre =====
pendienteCierre: { type: Boolean, default: false },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);


// Generar número de Orden de Servicio automáticamente si no viene
vehiculoSchema.pre('save', function (next) {
  if (!this.ordenServicio || this.ordenServicio === "") {
    const ahora = new Date();
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const dd = String(ahora.getDate()).padStart(2, '0');
    const hh = String(ahora.getHours()).padStart(2, '0');
    const mi = String(ahora.getMinutes()).padStart(2, '0');
    const ss = String(ahora.getSeconds()).padStart(2, '0');

    // Ejemplo: OS-20251210-143015
    this.ordenServicio = `OS-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }
  next();
});


module.exports = mongoose.model('Vehiculo', vehiculoSchema);
