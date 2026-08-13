import { useNavigate, useLocation } from "react-router-dom";
import { getPreviousPath } from "../utils/appNavStack";
import "../styles/BackButton.css";

export default function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === "/dashboard") return null;

  const handleClick = () => {
    // Si no hay una página previa registrada dentro de la app (ej. esta es
    // la primera pantalla tras iniciar sesión), evitamos retroceder hacia
    // /login y mandamos al usuario a dashboard en su lugar.
    const prev = getPreviousPath();
    if (prev) {
      navigate(-1);
    } else {
      navigate("/dashboard", { replace: true });
    }
  };

  return (
    <button
      type="button"
      className="back-button"
      onClick={handleClick}
      aria-label="Regresar"
      title="Regresar"
    >
      <span className="back-button__arrow" aria-hidden="true">←</span>
    </button>
  );
}
