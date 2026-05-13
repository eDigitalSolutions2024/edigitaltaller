// routes/codigos.js
const router = require('express').Router();
const mongoose = require('mongoose');
const Codigo = require('../models/CodigoRefaccion');   // tu modelo (ya con tipo/codigo/proveedor/grupoServicio)
const CodigoSeq = require('../models/CodigoSeq');      // el contador nuevo

// Helper: siguiente código por tipo
async function nextCodigo(tipo) {
  const key = tipo === 'servicio' ? 'servicio' : 'refaccion'; // normalizamos
  const prefix = key === 'servicio' ? 'S' : 'R';

  // incrementa el contador y regresa el documento actualizado
  const counter = await CodigoSeq.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return prefix + counter.seq; // p.ej. "R1", "S3"
}

// helper para validar grupoServicio
function sanitizeGrupoServicio(value) {
  const allowed = ['motor', 'lubricacion', 'revision', 'otros'];
  if (!value) return 'otros';
  const v = String(value).toLowerCase();
  return allowed.includes(v) ? v : 'otros';
}

// Listado + búsqueda + paginación
router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 100)));
    const q = String(req.query.q || '').trim();
    const tipo = req.query.tipo; // opcional: ?tipo=refaccion | servicio

    const filter = {};

    if (tipo === 'refaccion' || tipo === 'servicio') {
      filter.tipo = tipo;
    }

    if (q) {
      filter.$or = [
        { numeroParte: new RegExp(q, 'i') },
        { descripcion: new RegExp(q, 'i') },
        { proveedor: new RegExp(q, 'i') },
        { codigo: new RegExp(q, 'i') },
        { codigoSat: new RegExp(q, 'i') },
        { descripcionSat: new RegExp(q, 'i') },
      ];
    }


    const total = await Codigo.countDocuments(filter);
    const data  = await Codigo.find(filter)
      .sort({ codigo: 1 })   // ahora ordenamos por código interno R1/S1
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ success: true, data, total, page, limit });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Options para el select
router.get('/options', async (req, res) => {
  const tipo = req.query.tipo; // opcional

  const filter = {};
  if (tipo === 'refaccion' || tipo === 'servicio') {
    filter.tipo = tipo;
  }

  const list = await Codigo.find(
    filter,
    {
      codigo: 1,
      numeroParte: 1,
      proveedor: 1,
      descripcion: 1,
      tipo: 1,
      grupoServicio: 1,
      codigoSat: 1,
      descripcionSat: 1,
    }

  )
    .sort({ codigo:1 })
    .lean();

  const data = list.map(x => ({
    _id: x._id,
    codigo: x.codigo,
    tipo: x.tipo,
    grupoServicio: x.grupoServicio || 'otros',
    label: `${x.codigo} - ${x.numeroParte}${x.proveedor ? ' - ' + x.proveedor : ''}`,
    descripcion: x.descripcion || '',
    codigoSat: x.codigoSat || '',
    descripcionSat: x.descripcionSat || '',
  }));


  res.json({ success: true, data });
});

// Obtener uno
router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ success:false, message:'ID inválido' });

  const doc = await Codigo.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ success:false, message:'No encontrado' });

  res.json({ success:true, data:doc });
});

// Crear
router.post('/', async (req, res) => {
  try {
    // 1) tipo
    const tipo =
      req.body.tipo === 'servicio'
        ? 'servicio'
        : 'refaccion';

    const codigo = (req.body.codigo || req.body.numeroParte || '').trim();

    const payload = {
      tipo,
      codigo,
      numeroParte: codigo,
      descripcion: (req.body.descripcion || '').trim(),
      proveedor:
        tipo === 'servicio'
          ? ''
          : (req.body.proveedor || '').trim(),
      codigoSat: (req.body.codigoSat || '').trim(),
      descripcionSat: (req.body.descripcionSat || '').trim(),
    };



    // 👇 SOLO servicios: guardamos grupoServicio
    if (tipo === 'servicio') {
      payload.grupoServicio = sanitizeGrupoServicio(req.body.grupoServicio);
    }

    if (!payload.codigo) throw new Error('Código es obligatorio');

    const created = await Codigo.create(payload);
    res.status(201).json({ success:true, data:created });
  } catch (e) {
    res.status(400).json({ success:false, message:e.message });
  }
});

// Actualizar (no cambiamos el código)
router.put('/:id', async (req, res) => {
  try {
    const codigo = (req.body.codigo || req.body.numeroParte || '').trim();

    const payload = {
      codigo,
      numeroParte: codigo,
      descripcion: (req.body.descripcion || '').trim(),
      proveedor: (req.body.proveedor || '').trim(),
      codigoSat: (req.body.codigoSat || '').trim(),
      descripcionSat: (req.body.descripcionSat || '').trim(),
    };



    // si quieres permitir cambiar tipo:
    if (req.body.tipo === 'servicio' || req.body.tipo === 'refaccion') {
      payload.tipo = req.body.tipo;
      // ojo: aquí NO cambiamos codigo, se queda R.. o S.. como se creó
    }

    // 👇 si el registro (o el nuevo tipo) es servicio, permitimos actualizar grupoServicio
    if ((req.body.tipo || '').toString() === 'servicio' || req.body.grupoServicio) {
      payload.grupoServicio = sanitizeGrupoServicio(req.body.grupoServicio);
    }

    const updated = await Codigo.findByIdAndUpdate(
      req.params.id,
      payload,
      { new:true, runValidators:true }
    );
    if (!updated) return res.status(404).json({ success:false, message:'No encontrado' });
    res.json({ success:true, data:updated });
  } catch (e) {
    res.status(400).json({ success:false, message:e.message });
  }
});

// Eliminar
router.delete('/:id', async (req, res) => {
  const del = await Codigo.findByIdAndDelete(req.params.id);
  if (!del) return res.status(404).json({ success:false, message:'No encontrado' });
  res.json({ success:true });
});

module.exports = router;
