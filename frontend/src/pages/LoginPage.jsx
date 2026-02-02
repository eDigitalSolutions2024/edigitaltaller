import React from "react";
import LoginForm from "../components/LoginForm";
import "../styles/login.css";

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card shadow">
        <LoginForm />
      </div>
    </div>
  );
}
