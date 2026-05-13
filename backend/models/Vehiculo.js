// backend/models/Vehiculo.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// al inicio, antes del schema:
const ESTADOS_ORDEN = [
  'PENDIENTE_CAPTURA',
  'PENDIENTE_REFACCIONARIA',
  'PENDIENTE_AUTORIZACION_CLIENTE',
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

    // ----- Datos de Orden / cabecera -----
    ordenServicio: String,
    fechaRecepcion: Date,
    horaRecepcion: String,

    // Presupuesto
    dirigidoA: { type: String, default: "" },
    departamento: { type: String, default: "" },
    observCotizacion: { type: String, default: "" },
    requiereFactura: { type: Boolean, default: false },


    // ----- Datos de cliente / gobierno (snapshot en la orden) -----
    // Particular
    nombreCliente: String,
    apellidoPaterno: String,
    apellidoMaterno: String,
    
    nombreGobierno: String,
    nombreContactoGobierno: String,
    nombreDependencia: String,
    nombreContactoDependencia: String,

    telefonoFijoLada: String,
    telefonoFijo: String,
    celularLada: String,
    celular: String,

    direccion: String,
    numeroExt: String,
    numeroInt: String,
    colonia: String,
    rfc: String,
    codigoPostal: String,
    ciudad: String,
    estado: String,

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
    correo: String,
    traccion: String,

    // ----- Accesorios / checkboxes -----
    grua: String,
    precioGrua: { type: Number, default: 0 },   
    espejoLateralIzq: Boolean,
    espejoLateralDer: Boolean,
    copasDelanterasIzq: Boolean,
    copasDelanterasDer: Boolean,
    parabrisas: String,
    focosDel: Boolean,
    focosTras: Boolean,
    espejoInt: Boolean,
    tapetesDelanterosIzq: Boolean,
    tapetesDelanterosDer: Boolean,
    estereo: Boolean,
    extra: Boolean,
    copasTraserasIzq: Boolean,
    copasTraserasDer: Boolean,
    micas: Boolean,
    antena: Boolean,
    encendedor: Boolean,
    tapetesTraserosIzq: Boolean,
    tapetesTraserosDer: Boolean,
    gato: Boolean,
    bateria: Boolean,
    nivelGasolina: { type: String, default: null },

    // ----- Indicadores tablero / mecánicos -----
    checkEngine: String,
    abs: String,
    airBag: String,
    frenos: String,
    aceite: String,
    alternador: String,

    indicadoresTablero: String,
    otros: String,
    observaciones: String,

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

    historialDiagnosticos: [
      {
        texto: { type: String, default: "" },
        fecha: { type: Date, default: Date.now },
        usuario: { type: String, default: "" },
      }
    ],

    refaccionesSolicitadas: [
      {
        cant: { type: Number, default: 0 },
        unidad: { type: String, default: "" },
        refaccion: { type: String, default: "" },
        tipo: { type: String, default: "" }, // ej. SERVICIO / REFACCIÓN
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

        // Opción elegida por el asesor entre las opciones que dio refaccionaria
        opcionSeleccionada: { type: Number, default: null },

        // Opciones cotizadas por refaccionaria para esta refacción solicitada
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
            seleccionada: { type: Boolean, default: false },
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
    fechaPago: { type: String, default: "" }, // o Date si quieres
    observaciones: { type: String, default: "" },
  },
],

// ===== Observaciones finales =====
observacionesExternas: { type: String, default: "" },
observacionesInternas: { type: String, default: "" },
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
