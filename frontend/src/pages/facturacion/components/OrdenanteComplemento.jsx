// src/pages/facturacion/components/OrdenanteComplemento.jsx
//
// Banco y número de cuenta ORDENANTE (del cliente) de un Complemento de pago por
// transferencia. Las cuentas viven en Cliente.cuentasBancarias (una por banco): al
// elegir un banco con cuenta guardada se rellena sola; se puede corregir y guardar
// para la próxima vez. Ver backend/routes/clientes.js (/:id/cuentas-bancarias).
import { useEffect, useState } from "react";
import {
  getCustomerCuentasBancarias,
  updateCustomerCuentasBancarias,
} from "../../../api/customers";
import useBancos, { TERMINALES_CATALOGO } from "../../../hooks/useBancos";
import { REGLAS_ORDENANTE, errorCuentaOrdenante, limpiaCuenta } from "../../../utils/cuentaOrdenante";

export default function OrdenanteComplemento({ clienteId, formaPago, banco, cuenta, onChange, disabled }) {
  useBancos();
  const [guardadas, setGuardadas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!clienteId) {
      setGuardadas([]);
      return undefined;
    }
    let vivo = true;
    getCustomerCuentasBancarias(clienteId)
      .then(({ data }) => vivo && setGuardadas(Array.isArray(data?.data) ? data.data : []))
      .catch(() => vivo && setGuardadas([]));
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  const regla = REGLAS_ORDENANTE[formaPago];
  // Cuenta guardada de un banco para ESTA forma de pago; las capturas antiguas (sin forma)
  // sirven solo si su longitud es válida para la forma.
  const cuentaGuardada = (b) =>
    guardadas.find((c) => c.banco === b && c.formaPago === formaPago) ||
    guardadas.find(
      (c) => c.banco === b && !c.formaPago && !errorCuentaOrdenante(formaPago, c.numeroCuenta)
    );
  const guardadaDelBanco = cuentaGuardada(banco);
  const cuentaLimpia = limpiaCuenta(cuenta);
  const errCuenta = errorCuentaOrdenante(formaPago, cuentaLimpia);
  const hayCambio =
    !!banco && !!cuentaLimpia && !errCuenta && cuentaLimpia !== (guardadaDelBanco?.numeroCuenta || "");

  const elegirBanco = (b) => {
    setMsg("");
    onChange({ banco: b, cuenta: cuentaGuardada(b)?.numeroCuenta || "" });
  };

  const guardar = async () => {
    setSaving(true);
    setMsg("");
    try {
      const lista = [
        ...guardadas.filter((c) => !(c.banco === banco && (c.formaPago === formaPago || !c.formaPago))),
        { banco, formaPago, numeroCuenta: cuentaLimpia },
      ];
      const { data } = await updateCustomerCuentasBancarias(clienteId, lista);
      setGuardadas(Array.isArray(data?.data) ? data.data : lista);
      onChange({ banco, cuenta: cuentaLimpia });
      setMsg("✅ Cuenta guardada para este cliente.");
    } catch (err) {
      setMsg("❌ " + (err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="col-12 col-md-4">
        <label className="form-label">Banco ordenante (del cliente) — opcional</label>
        <select
          className="form-select"
          value={banco}
          disabled={disabled}
          onChange={(e) => elegirBanco(e.target.value)}
        >
          <option value="">— Sin especificar —</option>
          {TERMINALES_CATALOGO.map((b) => (
            <option key={b} value={b}>
              {b}
              {cuentaGuardada(b) ? " ✓" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="col-12 col-md-5">
        <label className="form-label">
          {formaPago === "04" || formaPago === "28" ? "Número de tarjeta del cliente" : "Número de cuenta del cliente"}
        </label>
        <div className="input-group">
          <input
            className={`form-control${errCuenta ? " is-invalid" : ""}`}
            inputMode="numeric"
            value={cuenta}
            disabled={disabled || !banco}
            placeholder={banco ? regla?.ejemplo || "" : "Elige primero el banco"}
            onChange={(e) => {
              setMsg("");
              onChange({ banco, cuenta: e.target.value });
            }}
          />
          {clienteId && (
            <button
              type="button"
              className="btn btn-outline-primary"
              disabled={disabled || saving || !hayCambio}
              onClick={guardar}
              title="Guarda esta cuenta en el cliente para la siguiente vez"
            >
              {saving ? "Guardando…" : guardadaDelBanco ? "Modificar y guardar" : "Guardar cuenta"}
            </button>
          )}
        </div>
        {errCuenta && <small className="text-danger d-block mt-1">{errCuenta}</small>}
        {msg && <small className="d-block mt-1">{msg}</small>}
        {!msg && banco && !cuenta && (
          <small className="text-muted d-block">
            Sin cuenta guardada en este banco para {regla?.nombre?.toLowerCase()}: captura {regla?.ejemplo}. El RFC del banco se toma del catálogo.
          </small>
        )}
      </div>
    </>
  );
}
