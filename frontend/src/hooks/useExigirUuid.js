import { useEffect, useState } from "react";
import { getExigirUuid } from "../api/configuracion";

// ¿Se exige el UUID (folio fiscal) real al relacionar facturas (nota de crédito, complemento de
// pago, "facturas relacionadas")? Lo define Configuración: el sistema no timbra, así que mientras
// tanto un administrador puede desactivarlo (solo pruebas, antes de subir a producción). Mientras
// carga, o si la consulta falla, se asume que SÍ se exige (lo seguro en producción).
export default function useExigirUuid() {
  const [exigirUuid, setExigirUuid] = useState(true);

  useEffect(() => {
    let activo = true;

    getExigirUuid()
      .then((data) => {
        if (activo) setExigirUuid(data?.valor !== false);
      })
      .catch(() => {
        if (activo) setExigirUuid(true);
      });

    return () => {
      activo = false;
    };
  }, []);

  return exigirUuid;
}
