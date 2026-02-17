import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, setUser, setLoading, checkUserRole } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await checkUserRole(currentUser.uid);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading, checkUserRole]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
