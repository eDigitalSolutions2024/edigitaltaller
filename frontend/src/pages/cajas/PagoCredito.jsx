import CajaPageHeader from '../../components/cajas/CajaPageHeader';
import CajaToolbar from '../../components/cajas/CajaToolbar';
import CajaTable from '../../components/cajas/CajaTable';
import '../../styles/cajas.css';

const BREADCRUMB = [
  { label: 'Inicio', to: '/dashboard' },
  { label: 'Cajas' },
  { label: 'Pago Crédito' },
];

const COLUMNS = [
  'Orden de Servicio',
  'Cliente',
  'Total',
  'Saldo',
  'Último Pago',
  'Estado',
  'Acciones',
];

export default function PagoCredito() {
  return (
    <div className="container-fluid py-3">
      <div className="row justify-content-center">
        <div className="col-12 col-xxl-10">

          <CajaPageHeader
            breadcrumb={BREADCRUMB}
            title="PAGO CRÉDITO"
            subtitle="Registro de pagos a órdenes de servicio con crédito"
          />

          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 py-3">
              <CajaToolbar buttonLabel="Registrar Pago" />
            </div>

            <CajaTable columns={COLUMNS} />

            <div className="card-footer bg-white border-0 d-flex align-items-center justify-content-between py-2">
              <span className="text-muted small">Sin registros</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
