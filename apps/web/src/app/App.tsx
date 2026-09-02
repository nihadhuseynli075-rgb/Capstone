import { useState } from "react";
import { RegisterPage } from "../features/auth/RegisterPage";
import { LoginPage } from "../features/auth/LoginPage";

export function App() {
  const [page, setPage] = useState<"home" | "register" | "login">("home");

  if (page === "register") {
    return <RegisterPage onBack={() => setPage("home")} />;
  }

  if (page === "login") {
    return <LoginPage onBack={() => setPage("home")} />;
  }

  return (
    <main>
      <h1>ExamPeak</h1>

      <button onClick={() => setPage("register")}>
        Register
      </button>

      <br />
      <br />

      <button onClick={() => setPage("login")}>
        Login
      </button>
    </main>
  );
}