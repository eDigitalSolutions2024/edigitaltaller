import React from "react";
import { Outlet } from "react-router-dom";

export default function CajasLayout() {
  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">💰 Cajas</h2>
      <div className="card shadow-sm">
        <div className="card-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
