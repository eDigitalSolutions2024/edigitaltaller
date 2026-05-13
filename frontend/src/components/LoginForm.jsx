import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginApi } from "../api/auth";
import { saveSession } from "../auth";
import "../styles/login.css";

export default function LoginForm() {
  const navigate = useNavigate();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await loginApi({
        login: login.trim(),
        password,
      });

      saveSession(data);
      navigate("/dashboard");
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err.message ||
        "Error en el login";

      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="overlay">
          <h2>Bienvenidos a Edigital Solutions</h2>
        </div>
      </div>

      <div className="login-right">
        <form onSubmit={handleSubmit} className="login-form">
          <h2 className="mb-2">Inicia Sesión</h2>
          <p className="text-muted">Edigital Solutions</p>

          {error && <div className="alert alert-danger">{error}</div>}

          <div className="mb-3">
            <input
              type="text"
              className="form-control"
              placeholder="Usuario o correo"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="mb-3">
            <input
              type="password"
              className="form-control"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn btn-danger w-100" disabled={loading}>
            {loading ? "Cargando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}