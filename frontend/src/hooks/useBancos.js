import { useEffect, useState } from "react";
import { getBancos } from "../api/configuracion";

// Catálogo único de bancos/terminales para los selectores de Cajas, Anticipos,
// Facturas y Órdenes. TERMINALES_CATALOGO es UN solo arreglo que se llena en el
// lugar al cargar (empieza con los bancos fijos), así que los módulos que lo
// importan a nivel de archivo ven también los bancos agregados desde Configuración.
export const TERMINALES_CATALOGO = [
  "BANREGIO",
  "AMERICAN EXPRESS",
  "BANAMEX",
  "BANORTE",
  "BBVA BANCOMER",
  "SANTANDER",
  "HSBC",
  "SCOTIABANK",
  "AZTECA",
  "BANCOPPEL",
  "AFIRME",
  "INBURSA",
];

let cargado = false;
let cargando = null;

function cargar() {
  if (cargado) return Promise.resolve(false);
  if (!cargando) {
    cargando = getBancos()
      .then((data) => {
        const valores = (data?.bancos || []).map((b) => b.value);
        if (valores.length) TERMINALES_CATALOGO.splice(0, TERMINALES_CATALOGO.length, ...valores);
        cargado = true;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        cargando = null;
      });
  }
  return cargando;
}

// Invalida el caché (p. ej. tras agregar un banco) para volver a pedirlo.
export function recargarBancos() {
  cargado = false;
  return cargar();
}

// Devuelve el catálogo y vuelve a renderizar cuando llega del servidor.
export default function useBancos() {
  const [, setTick] = useState(0);
  useEffect(() => {
    let vivo = true;
    cargar().then((cambio) => {
      if (vivo && cambio) setTick((t) => t + 1);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return TERMINALES_CATALOGO;
}
