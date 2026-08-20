const mongoose = require('mongoose');

// Contenido original (NOM-174-SCFI-2007) usado como valor por defecto la
// primera vez que se consulta la configuración, antes de que un admin lo
// edite desde Configuración.
const TITULO_DEFAULT =
  'CONDICIONES DEL CONTRATO DE PRESTACIÓN DE SERVICIOS DE REPARACIÓN Y/O MANTENIMIENTO DE VEHÍCULOS';

const CLAUSULAS_DEFAULT = [
  'En virtud de este contrato (*), el Distribuidor presta el servicio de reparación y/o mantenimiento al cliente (Consumidor), del vehículo cuyas características se detallan en este contrato.',
  'El Cliente expresa ser el dueño del vehículo y/o estar facultado para autorizar la reparación y/o mantenimiento del vehículo descrito en el presente contrato, por lo que acepta las condiciones y términos bajo las cuales se realizará la prestación del servicio descrita en el presente contrato. Asimismo, es sabedor de las posibles consecuencias que puede sufrir el vehículo con motivo de su reparación y/o mantenimiento y se responsabiliza de las mismas. El consumidor acepta haber tenido a la vista los precios por mano de obra, partes y/o refacciones a emplear en las operaciones a efectuar por parte del Distribuidor.',
  'El precio total por concepto de la prestación del servicio de reparación y/o mantenimiento será cubierto en las instalaciones del Distribuidor y en moneda nacional en la forma y término expresados en este contrato, incluyendo, en su caso, las partes y/o refacciones y los servicios adicionales que el cliente haya aceptado previamente.',
  'En la situación de que el Cliente solicite, o en su caso, el Distribuidor avise al Cliente de servicios adicionales a los establecidos en el presente contrato, este último los podrá autorizar vía telefónica. Asimismo, todas las quejas y sugerencias serán atendidas en el domicilio, teléfonos y horarios de atención señalados en la carátula o anverso del presente contrato.',
  'Las condiciones generales del vehículo materia de reparación y/o mantenimiento son las siguientes. Exteriores: ( ) Limpiadores (plumas); ( ) Unidades de las luces; ( ) Antena; ( ) Espejos laterales; ( ) Cristales; ( ) Tapones de ruedas; ( ) Molduras completas; ( ) Tapón de gasolina; ( ) Claxon. Interiores: ( ) Instrumentos del tablero; ( ) Calefacción; ( ) Aire acondicionado; ( ) Radio/Tipo; ( ) Bocinas; ( ) Encendedor; ( ) Espejo retrovisor; ( ) Ceniceros; ( ) Cinturones de seguridad; ( ) Tapetes; ( ) Manijas y/o controles interiores; ( ) Equipo adicional; ( ) Accesorios. Aditamentos especiales: ( ) Otros. El vehículo se encuentra en las siguientes condiciones generales: Aspectos mecánicos _______________ aspectos de carrocería _______________.',
  'La prestación del servicio de reparación y/o mantenimiento del vehículo materia de este contrato, se otorga ( ) sin garantía; ( ) con garantía por un plazo de _______, (Art. 77 de la LFPC* no podrá ser inferior a 90 días) contados a partir de la entrega del vehículo. Para la garantía en partes, piezas, refacciones y accesorios, el distribuidor transmitirá la otorgada por la fabricante; la garantía deberá hacerse válida en el domicilio, teléfonos y horarios de atención señalados en la carátula o anverso del presente contrato, siempre y cuando no se haya efectuado una reparación por un tercero. El tiempo que dure la reparación y/o mantenimiento del vehículo, bajo la protección de la garantía, no es computable dentro del plazo de la misma. Las partes y/o refacciones empleadas en la reparación y/o mantenimiento del vehículo materia de este contrato, son nuevas y apropiadas para el funcionamiento del mismo. De igual forma, los gastos en que incurra el Cliente para hacer válida la garantía en un domicilio diverso al del Distribuidor, deberán ser cubiertos por éste.',
  'El Distribuidor será el responsable por las descomposturas, daños o pérdidas parciales o totales imputables a él, mientras el vehículo se encuentre bajo su resguardo para llevar a cabo la prestación del servicio de reparación y/o mantenimiento, o como consecuencia de la prestación del servicio, o bien, en el cumplimiento de la garantía, de acuerdo a lo establecido en el presente contrato. Asimismo, el Cliente autoriza al Distribuidor a usar el vehículo para efectos de prueba o verificación de las operaciones a realizar o realizadas. El cliente libera al Distribuidor de cualquier responsabilidad que hubiere surgido o pudiera surgir con relación al origen, propiedad o posesión del vehículo.',
  'El cliente podrá revocar su consentimiento, en un plazo de 5 días hábiles mediante aviso personal, correo electrónico o correo certificado, siempre y cuando no se hayan iniciado los trabajos de reparación y/o mantenimiento.',
  'En caso de que apliquen restricciones, estas se le darán a conocer al cliente.',
  'En caso de que el consumidor cancele la operación, está obligado a pagar de manera inmediata y previa a la entrega del vehículo, el importe de las operaciones efectuadas y partes y/o refacciones colocadas o adquiridas hasta el retiro del mismo.',
  'Son causas de rescisión del presente contrato: (i) Que el Distribuidor incumpla en la fecha y lugar de entrega del vehículo por causas imputables a él. El Cliente le notificará por escrito el incumplimiento de dicha obligación y el Distribuidor entregará de manera inmediata el vehículo, debiendo descontar del monto total de la operación la cantidad equivalente al ______% por concepto de pena convencional. (ii) Que el Cliente incumpla con su obligación de pago. En el evento que el Cliente incumpla con el pago por el concepto de la reparación y/o mantenimiento del vehículo, el Distribuidor le notificará por escrito su incumplimiento y podrá exigirle la rescisión o cumplimiento por mora, más la pena convencional del ______% del monto total de la operación. Las penas convencionales deberán ser equitativas y de la misma magnitud para las partes.',
  'El Consumidor deberá recoger el vehículo en la fecha y lugar establecida en el presente contrato; en caso contrario, se obliga a pagar al Distribuidor la cantidad que resulte por concepto de almacenaje del vehículo por cada día que transcurra, tomando como referencia una tarifa no mayor al precio general establecido para estacionamientos públicos ubicados en la localidad del Distribuidor. Transcurrido un plazo de 15 días naturales a partir de la fecha señalada para la entrega del vehículo, y el Cliente no acuda a recoger el mismo, el Distribuidor, sin responsabilidad alguna, pondrá a disposición de la autoridad correspondiente dicho vehículo. Sin perjuicio de lo anterior, el Distribuidor podrá realizar el cobro correspondiente por el concepto de almacenaje.',
  'El Distribuidor se obliga a expedir la factura o comprobante de pago por las operaciones efectuadas, en la cual se especificarán los precios por mano de obra, refacciones, materiales y accesorios empleados, así como la garantía que en su caso se otorgue, conforme al artículo 62 de la Ley Federal de Protección al Consumidor.',
  'El Distribuidor se obliga a: (i) no ceder o transmitir a terceros, con fines mercadotécnicos o publicitarios, los datos e información proporcionada por el consumidor con motivo del presente contrato; (ii) no enviar publicidad sobre bienes y servicios, salvo autorización expresa del consumidor en la presente cláusula.',
  'Las partes están de acuerdo en someterse a la competencia de la Procuraduría Federal del Consumidor en la vía administrativa para resolver cualquier controversia que se suscite sobre la interpretación o cumplimiento de los términos y condiciones del presente contrato y de las disposiciones de la Ley Federal de Protección al Consumidor, la Norma Oficial Mexicana NOM-174-SCFI-2007, Prácticas comerciales-Elementos de información para la prestación de servicios en general y cualquier otra disposición aplicable, sin perjuicio del derecho que tienen las partes de someterse a la jurisdicción de los Tribunales competentes del domicilio del Distribuidor, renunciando las partes expresamente a cualquier otra jurisdicción que pudiera corresponderles por razón de sus domicilios futuros.',
  'El Cliente y Distribuidor aceptan la realización de la prestación del servicio de reparación y/o mantenimiento, en los términos establecidos en este contrato, y sabedores de su alcance legal, lo firman por duplicado.',
];

const PIE_PAGINA_DEFAULT = [
  '(*) El presente contrato fue registrado en la Procuraduría Federal del Consumidor bajo el número 115-2019 de fecha 10 de Enero de 2019',
  '*LFPC.- Ley Federal de Protección al Consumidor',
];

const ContratoOrdenServicioSchema = new mongoose.Schema(
  {
    titulo: { type: String, default: TITULO_DEFAULT, trim: true },
    clausulas: { type: [String], default: () => [...CLAUSULAS_DEFAULT] },
    piePagina: { type: [String], default: () => [...PIE_PAGINA_DEFAULT] },
  },
  { timestamps: true }
);

// Documento único (singleton): si no existe todavía se crea con el
// contenido por defecto la primera vez que se consulta.
ContratoOrdenServicioSchema.statics.getOrCreate = async function () {
  let doc = await this.findOne().sort({ createdAt: -1 });
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('ContratoOrdenServicio', ContratoOrdenServicioSchema);
