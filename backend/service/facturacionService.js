// backend/service/facturacionService.js
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function requireArray(name, value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} debe ser un arreglo con al menos 1 elemento`);
  }
}

exports.buildPreview = async (payload) => {
  const ivaRate = Number(payload.ivaRate ?? 0.16);                 // 0.16 / 0.08 / 0
  const retencionIvaRate = Number(payload.retencionIvaRate ?? 0);  // 0 / 0.06 / 0.03
  const aplicarRetencionIsr = Boolean(payload.aplicarRetencionIsr); // true/false

  requireArray("items", payload.items);

  const conceptos = payload.items.map((it) => {
    const cantidad = Number(it.cantidad ?? 0);
    const valorUnitario = Number(it.valorUnitario ?? 0);
    const importe = round2(cantidad * valorUnitario);

    return {
      descripcion: String(it.descripcion ?? "").trim(),
      cantidad,
      valorUnitario,
      importe,
      // luego agregamos claveProdServ/claveUnidad/objetoImp
    };
  });

  const subTotal = round2(conceptos.reduce((sum, c) => sum + c.importe, 0));

  const iva = round2(subTotal * ivaRate);

  // ISR 1.25% (como tu caso regimen 601)
  const retencionIsr = aplicarRetencionIsr ? round2(subTotal * 0.0125) : 0;

  // Retención IVA (3%/6%) si aplica
  const retencionIva = retencionIvaRate > 0 ? round2(subTotal * retencionIvaRate) : 0;

  // Total típico: SubTotal + IVA - Retenciones
  const total = round2(subTotal + iva - retencionIsr - retencionIva);

  return {
    conceptos,
    subTotal,
    iva,
    retencionIsr,
    retencionIva,
    total,
    meta: {
      ivaRate,
      retencionIvaRate,
      aplicarRetencionIsr,
    },
  };
};
