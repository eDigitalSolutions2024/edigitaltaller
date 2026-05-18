import React from "react";
import { Outlet } from "react-router-dom";

export default function FacturacionLayout() {
  return (
    <div className="page">
      {/* aquí puedes dejar un wrapper si quieres, pero sin Navbar */}
      <Outlet />
    </div>
  );
}
