import { useEffect } from "react";

const INTERVALO_MS = 60_000;

/**
 * En la tablet (FreeKiosk) la app queda abierta indefinidamente, así que un
 * deploy nuevo nunca se nota hasta que alguien sale de la app y vuelve a
 * cargar el link a mano. Este hook compara cada minuto el asset-manifest.json
 * que genera react-scripts en cada build (trae el hash de contenido del
 * bundle actual) contra el que se leyó al abrir la página; si cambió, recarga
 * sola.
 */
export default function useAutoReloadOnDeploy() {
  useEffect(() => {
    let versionInicial = null;
    let cancelado = false;

    async function leerVersion() {
      const res = await fetch("/asset-manifest.json", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return data.files?.["main.js"] || null;
    }

    async function chequear() {
      try {
        const version = await leerVersion();
        if (version == null || cancelado) return;
        if (versionInicial == null) {
          versionInicial = version;
        } else if (version !== versionInicial) {
          window.location.reload();
        }
      } catch {
        // Sin conexión momentánea: se reintenta en el próximo ciclo.
      }
    }

    chequear();
    const id = setInterval(chequear, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, []);
}
