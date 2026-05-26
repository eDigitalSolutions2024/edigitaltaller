// src/components/ModalAltaCliente.jsx
import AltaCliente from "../pages/clientes/AltaCliente";

export default function ModalAltaCliente({ nombreInicial = "", onClienteCreado, onCerrar }) {
  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">

          {/* Header */}
          <div className="modal-header">
            <h5 className="modal-title">Nuevo Cliente</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onCerrar}
            />
          </div>

          {/* Body — aquí va el form completo */}
          <div className="modal-body">
            <AltaCliente
              modoModal
              nombreInicial={nombreInicial}
              onClienteCreado={onClienteCreado}
            />
          </div>

        </div>
      </div>
    </div>
  );
}