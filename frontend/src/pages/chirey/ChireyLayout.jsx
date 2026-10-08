import React from "react";
import { Outlet } from "react-router-dom";
import "../../styles/lineaChirey.css";
import chireyIcono from "../../img/Chirey-icono.svg";
import useTemaChirey from "../../hooks/useTemaChirey";

/**
 * Apartado Chirey: agrupa todo lo de la línea Chirey (órdenes, inventario
 * propio y reportes). Las pantallas son las mismas que las del resto del
 * sistema; lo que cambia es que, colgando de /chirey, filtran y escriben con la
 * línea CHIREY (ver hooks/useLineaNegocio). La navegación vive en el menú
 * lateral (components/Navbar.jsx).
 */
export default function ChireyLayout() {
  useTemaChirey(true);
  return (
    <div className="fondo-chirey">
      <div className="d-flex align-items-center gap-2 px-2 pt-2 pb-1">
        <h1 className="m-0 fs-4 fw-bold d-flex align-items-center gap-2">
          <img src={chireyIcono} alt="Chirey" style={{ height: 30, width: "auto" }} />
          Chirey
        </h1>
      </div>
      <Outlet />
    </div>
  );
}
