// frontend/src/pages/refaccionaria/RefaccionariaLayout.jsx
import { Outlet } from "react-router-dom";

export default function RefaccionariaLayout() {
  return (
    <div className="p-3">
      {/* Aquí se renderizan las páginas hijas de Refaccionaria */}
      <Outlet />
    </div>
  );
}
