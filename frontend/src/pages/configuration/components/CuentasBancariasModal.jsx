import { useEffect, useState } from "react";

// Modal de Configuración › Cuentas bancarias: tabla de todos los bancos en solo
// lectura; "Editar" habilita RFC y número de cuenta de todas las filas a la vez.
export default function CuentasBancariasModal({ show, onClose, cuentas, guardando, onGuardar }) {
  const [borrador, setBorrador] = useState([]);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (show) {
      setBorrador(cuentas.map((c) => ({ ...c })));
      setEditando(false);
    }
  }, [show, cuentas]);

  if (!show) return null;

  const setCampo = (banco, campo, valor) =>
    setBorrador((prev) => prev.map((c) => (c.banco === banco ? { ...c, [campo]: valor } : c)));

  const agregarBanco = () =>
    setBorrador((prev) => [
      ...prev,
      { banco: `nuevo-${Date.now()}`, nuevo: true, label: "", abrev: "", rfc: "", numeroCuenta: "" },
    ]);
  const quitarNuevo = (banco) => setBorrador((prev) => prev.filter((c) => c.banco !== banco));

  const cancelarEdicion = () => {
    setBorrador(cuentas.map((c) => ({ ...c })));
    setEditando(false);
  };

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable cuentas-modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title fw-bold">Cuentas bancarias</h5>
              <small className="text-muted">
                La abreviatura se usa en los reportes; el RFC y la cuenta, en el Complemento de pago.
              </small>
            </div>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="config-form">
              <table className="cuentas-tabla">
                <thead>
                  <tr>
                    <th>Banco</th>
                    <th>Abrev.</th>
                    <th>RFC</th>
                    <th>Número de cuenta</th>
                  </tr>
                </thead>
                <tbody>
                  {borrador.map((c) => (
                    <tr key={c.banco}>
                      <td className="cuentas-tabla-banco">
                        {c.nuevo ? (
                          <div className="cuentas-nuevo-nombre">
                            <input
                              type="text"
                              value={c.label}
                              placeholder="Nombre del banco"
                              onChange={(e) => setCampo(c.banco, "label", e.target.value)}
                            />
                            <button type="button" className="cuentas-quitar" title="Quitar" onClick={() => quitarNuevo(c.banco)}>×</button>
                          </div>
                        ) : (
                          c.label || c.banco
                        )}
                      </td>
                      <td className="cuentas-tabla-abrev">
                        <input
                          type="text"
                          value={c.abrev || ""}
                          disabled={!editando}
                          maxLength={6}
                          onChange={(e) => setCampo(c.banco, "abrev", e.target.value.toUpperCase())}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={c.rfc || ""}
                          disabled={!editando}
                          maxLength={13}
                          placeholder="— sin capturar —"
                          onChange={(e) => setCampo(c.banco, "rfc", e.target.value.toUpperCase())}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={c.numeroCuenta || ""}
                          disabled={!editando}
                          placeholder="— sin capturar —"
                          onChange={(e) => setCampo(c.banco, "numeroCuenta", e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="modal-footer">
            {editando ? (
              <>
                <button
                  type="button"
                  className="config-secondary-button"
                  style={{ padding: "0 16px", marginRight: "auto" }}
                  onClick={agregarBanco}
                >
                  + Agregar banco
                </button>
                <button type="button" className="config-secondary-button" style={{ padding: "0 16px" }} onClick={cancelarEdicion}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="config-secondary-button"
                  style={{ padding: "0 18px", background: "#111827", borderColor: "#111827", color: "#fff" }}
                  disabled={guardando}
                  onClick={() => onGuardar(borrador)}
                >
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="config-secondary-button" style={{ padding: "0 16px" }} onClick={onClose}>
                  Cerrar
                </button>
                <button
                  type="button"
                  className="config-secondary-button"
                  style={{ padding: "0 18px", background: "#111827", borderColor: "#111827", color: "#fff" }}
                  onClick={() => setEditando(true)}
                >
                  Editar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
