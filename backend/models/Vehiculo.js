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
  'CANCELADA',
];

// ===== Cajas: catálogos =====
const BANCOS_CAJA = ['BANREGIO', 'AMERICAN EXPRESS', 'BANAMEX', 'BANORTE', 'BBVA BANCOMER', 'DOLARES', 'EFECTIVOS'];
const TIPO_NOTA = ['Contado', 'Credito', 'Cancelada'];

// ===== Solicitud de Garantía =====
// Sub-documento embebido en la orden NUEVA que se abre por garantía.
// default: null → las órdenes normales no llevan garantía.
const garantiaSchema = new Schema(
  {
    estado: {
      type: String,
      enum: ['PENDIENTE', 'APROBADA', 'NEGADA'],
      default: 'PENDIENTE',
    },
    motivo: { type: String, default: '' },
    ordenAnterior: { type: Schema.Types.ObjectId, ref: 'Vehiculo', default: null },
    ordenAnteriorFolio: { type: String, default: '' },
    fechaSolicitud: { type: Date, default: null },
    // "fecha devolución solicitud": se captura al aprobar o negar
    fechaResolucion: { type: Date, default: null },
    // Ajuste al total de la orden (SIN IVA); negativo = descuento
    costoDiferencia: { type: Number, default: 0 },
    autorizaCarreon: { type: Boolean, default: false },
    resueltoPor: { type: String, default: '' },
  },
  { _id: false }
);

const vehiculoSchema = new Schema(
  {

    // Referencia al cliente dueño del vehículo
    cliente: {
      type: Schema.Types.ObjectId,
      ref: 'Cliente',
      required: true,
    },

    // Orden "Sin Vehículo": cliente walk-in que compra refacciones sueltas o
    // recibe un servicio sin registrar vehículo. Se decide en la creación;
    // no se incluye en el whitelist de PUT /:id/datos, por lo que es
    // inmutable después de creada la orden.
    sinVehiculo: { type: Boolean, default: false },

    // NUEVO: estado de la orden
    estadoOrden: {
      type: String,
      enum: ESTADOS_ORDEN,
      default: 'PENDIENTE_CAPTURA',
      index: true,
    },

    // Solicitud de garantía (null = orden normal)
    garantia: { type: garantiaSchema, default: null },

    fechaSolicitudRefacciones: { type: Date, default: null },
    fechaRespuestaRefaccionaria: { type: Date, default: null },
    // El asesor decidió continuar sin solicitar refacciones a refaccionaria
    refaccionesOmitidas: { type: Boolean, default: false },
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
        origenRefId: { type: String, default: null },
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
        // Partida de servicio/mano de obra: no pasa por refaccionaria ni surtido
        esServicio: { type: Boolean, default: false },
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
        motivoPrecioCero: { type: String, default: "" }, // justificación cuando precioVenta <= 0
        esGarantia: { type: Boolean, default: false }, // legado: ya no se inyectan filas de garantía; solo para limpiar datos viejos
        esGrua: { type: Boolean, default: false }, // marca la línea auto-generada a partir del precio de grúa
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

// ===== IVA (porcentaje editable, normalmente 8%) =====
ivaPresupuesto: { type: Number, default: 8 },
ivaVenta: { type: Number, default: 8 },

// ===== Observaciones finales =====
observacionesExternas: { type: String, default: "" },
observacionesInternas: { type: String, default: "" },
// ===== Control de cierre =====
pendienteCierre: { type: Boolean, default: false },

    // ===== Último Vale de Salida emitido para esta orden =====
    ultimoVale: {
      noVale: { type: Number, default: null },
      dig: { type: Number, default: 0 },
      fecha: { type: Date, default: null },
    },

    // ===== Cajas: pagos / abonos =====
    // Cada pago lleva su propio comprobante (Nota de Venta o Remisión), con
    // folio propio asignado al momento de registrarlo — un mismo pago no
    // puede tener ambos comprobantes.
    pagos: [
      {
        fecha: { type: Date, default: Date.now },
        tipoPago: { type: String, enum: ['COMPLETO', 'ABONO', 'ANTICIPO'], default: 'ABONO' },
        comprobante: { type: String, enum: ['NOTA_VENTA', 'REMISION'], required: true },
        montoPesos: { type: Number, default: 0 },
        montoDolares: { type: Number, default: 0 },
        tipoCambio: { type: Number, default: 0 },
        // monto total ya convertido a MN = montoPesos + montoDolares*tipoCambio
        monto: { type: Number, default: 0 },
        referencia: { type: String, default: '' },
        observaciones: { type: String, default: '' },
        registradoPor: { type: String, default: '' },

        // Presente solo si comprobante === 'NOTA_VENTA'
        // numero sin default: si se le pone `default: null`, Mongoose lo agrega
        // también a los pagos por REMISION (aplica defaults del subdocumento
        // completo en $push), y ese `null` explícito rompe el índice unique+sparse
        // de abajo porque sparse solo excluye campos ausentes, no en null.
        notaVenta: {
          numero: { type: Number },
          banco: { type: String, enum: BANCOS_CAJA },
          tipo: { type: String, enum: TIPO_NOTA, default: 'Contado' },
        },

        // Presente solo si comprobante === 'REMISION' (ver nota arriba)
        remision: {
          numero: { type: Number },
          tipo: { type: String, enum: TIPO_NOTA, default: 'Contado' },
          fechaPagada: { type: Date, default: null },
        },
      },
    ],

    // ===== Cajas: Descuentos (globales a la orden o sobre una pieza/servicio) =====
    descuentos: [
      {
        tipo: { type: String, enum: ['PORCENTAJE', 'MONTO'], default: 'MONTO' },
        valor: { type: Number, default: 0 },
        motivo: { type: String, default: '' },
        activo: { type: Boolean, default: true },
        aplicadoPor: { type: String, default: '' },
        fecha: { type: Date, default: null },
        // null = descuento global a toda la orden; si trae valor, referencia
        // el _id de la partida en ventaCliente sobre la que aplica.
        lineaId: { type: Schema.Types.ObjectId, default: null },
      },
    ],
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);


vehiculoSchema.index({ 'garantia.estado': 1 });
vehiculoSchema.index({ 'pagos.notaVenta.numero': 1 }, { unique: true, sparse: true });
vehiculoSchema.index({ 'pagos.remision.numero': 1 }, { unique: true, sparse: true });

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
module.exports.BANCOS_CAJA = BANCOS_CAJA;
module.exports.TIPO_NOTA = TIPO_NOTA;
