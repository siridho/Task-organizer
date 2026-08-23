import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { formatError } from "../api";
import { Zap, ShieldCheck, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("admin@nexus.local");
  const [password, setPassword] = useState("demo123");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || password.length < 4) {
      setError("Enter a valid email and a password with 4+ characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name || email.split("@")[0]);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const demoLogin = async (mail) => {
    setBusy(true);
    setError("");
    try { await login(mail, "demo123"); }
    catch (err) {
      setError(formatError(err));
      toast.error("Demo login failed — try the admin account.");
    }
    finally { setBusy(false); }
  };

  return (
    <main className="auth-shell">
      <div className="auth-visual">
        <div className="brand-mark"><Zap size={18} fill="currentColor"/> nexus<span>task</span></div>
        <div className="auth-quote">
          <p>“Clarity is the beginning of execution.”</p>
          <small>One focused workspace for every team.</small>
        </div>
        <div className="auth-orbit orbit-one"/>
        <div className="auth-orbit orbit-two"/>
      </div>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <p className="eyebrow">TEAM OPERATIONS</p>
          <h1>{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>
          <p className="muted">
            {mode === "login" ? "Pick up where your team left off." : "Bring your projects, people, and momentum together."}
          </p>
          <form onSubmit={submit} data-testid="auth-form">
            {mode === "register" && (
              <label>Full name
                <input data-testid="auth-name-input" value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. Maya Chen" />
              </label>
            )}
            <label>Email address
              <input data-testid="auth-email-input" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
            </label>
            <label>Password
              <input data-testid="auth-password-input" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
            </label>
            {error && <div className="error-text" data-testid="auth-error">{error}</div>}
            <button className="primary-btn wide" data-testid="auth-submit-button" disabled={busy}>
              {busy ? "Please wait…" : (mode === "login" ? "Sign in" : "Create account")}
              <span>→</span>
            </button>
          </form>
          <div className="auth-divider"><span>or continue with a demo account</span></div>
          <div className="demo-grid">
            <button data-testid="demo-super-user-button" onClick={()=>demoLogin("admin@nexus.local")}>
              <ShieldCheck size={16}/> Super Admin
            </button>
            <button data-testid="demo-admin-button" onClick={()=>demoLogin("maya@nexus.local")}>
              <Users size={16}/> Admin
            </button>
            <button data-testid="demo-member-button" onClick={()=>demoLogin("noah@nexus.local")}>
              <ClipboardList size={16}/> Member
            </button>
          </div>
          <p className="auth-switch">
            {mode === "login" ? "New to nexus?" : "Already have an account?"}{" "}
            <button data-testid="auth-mode-toggle" type="button"
              onClick={()=>setMode(mode==="login"?"register":"login")}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
