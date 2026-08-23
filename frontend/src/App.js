import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import AuthScreen from "./pages/AuthScreen";
import Workspace from "./pages/Workspace";
import { Toaster } from "sonner";
import "@/App.css";

function Gate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen" data-testid="app-loading">
        <span className="loading-dot"></span>
      </div>
    );
  }
  return user ? <Workspace /> : <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="bottom-right" theme="light" richColors />
      <Gate />
    </AuthProvider>
  );
}
