import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        Loading...
      </div>
    );
  }

  // Allow access if we have a token even if the user payload hasn't hydrated yet
  if (!user && !token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
