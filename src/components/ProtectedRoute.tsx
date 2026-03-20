// src/components/ProtectedRoute.tsx
import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, adminProfile, loading, setUser, setLoading, checkUserRole } = useAuthStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) await checkUserRole(u.uid);
      setLoading(false);
    });
    return () => unsub();
  }, [setUser, setLoading, checkUserRole]);

  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!adminProfile) return <Navigate to="/login" replace />; // or /not-authorized

  return <>{children}</>;
}