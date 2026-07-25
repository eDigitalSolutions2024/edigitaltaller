import React, { useState } from 'react';
import PeriodoSelector from '../../captura/PeriodoSelector';

const TIPOS = [
  { key: 'NOTA_VENTA', label: 'Facturas' },
  { key: 'REMISION', label: 'Remisiones' },
];

export default function ReporteCajasIngresos() {
  const [mostrar, setMostrar] = useState(true);
  const [tipo, setTipo] = useState('NOTA_VENTA');

  const handleBuscar = () => {};

  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">💰 Reporte de Cajas</h2>

      <div className="mb-3">
        <button
          type="button"
          className={'px-3 py-2 rounded-pill me-2 ' + (mostrar ? 'btn btn-primary' : 'btn btn-outline-primary')}
          onClick={() => setMostrar(true)}
        >
          Reporte diario de ingresos
        </button>
      </div>

      {mostrar && (
        <div className="card shadow-sm">
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label mb-1 fw-semibold small d-block">Tipo de comprobante</label>
              <div className="btn-group">
                {TIPOS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`btn btn-sm ${tipo === t.key ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setTipo(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <PeriodoSelector onBuscar={handleBuscar} cargando={false} />
          </div>
        </div>
      )}
    </div>
  );
}
