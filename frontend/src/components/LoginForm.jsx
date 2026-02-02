import React, { useState } from "react";
import { useNavigate } from "react-router-dom";        // ← para redirigir
import { loginApi } from "../api/auth";
import { saveSession } from "../auth";                 // ← guarda token y user en localStorage
import "../styles/login.css";

export default function LoginForm() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 👈 IMPORTANTE: enviar un OBJETO { email, password }
      const { data } = await loginApi({
        email: email.trim(),
        password,
        // si validas el taller en backend, agrega: workshopName: 'Edigital Solutions'
      });

      // data = { token, user }
      saveSession(data);
      navigate("/dashboard");
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || "Error en el login";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Columna izquierda */}
      <div className="login-left">
        <div className="overlay">
          <h2>Bienvenidos a Edigital Solutions</h2>
        </div>
      </div>

      {/* Columna derecha */}
      <div className="login-right">
        <form onSubmit={handleSubmit} className="login-form">
          <h2 className="mb-2">Inicia Sesion</h2>
          <p className="text-muted">Edigital Solutions</p>

          {error && <div className="alert alert-danger">{error}</div>}

          <div className="mb-3">
            <input
              type="email"
              className="form-control"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <input
              type="password"
              className="form-control"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="btn btn-danger w-100" disabled={loading}>
            {loading ? "Cargando..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
