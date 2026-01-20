import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner"; // Using sonner for easy feedback

// Pages & Components
import Dashboard from "./pages/Dashboard";
import MealPlans from "./pages/MealPlans";
import ShoppingLists from "./pages/ShoppingLists";
import Chat from "./pages/Chat";
import Favorites from "./pages/Favorites";
import Macros from "./pages/Macros";
import NotFound from "./pages/NotFound";
import Login from "./pages/Auth/Login";
import Register from "./pages/Auth/Register";
import Launch from "./pages/Launch";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60 * 1000,
      retry: (failureCount, error: any) => {
        const status = error?.status;
        if (error?.code === "TAB_HIDDEN") return false;
        if (status === 401 || status === 429) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

const App = () => {
  useEffect(() => {
    // Pause React Query focus state when tab is hidden.
    const onVisibility = () => {
      const isVisible = !document.hidden;
      focusManager.setFocused(isVisible);
      onlineManager.setOnline(isVisible);
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" />

        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

const AppRoutes = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const handleExpired = () => {
      logout();
      toast.error("Session expired. Please log in again.");
      navigate("/login");
    };
    window.addEventListener("auth:expired", handleExpired as EventListener);
    return () => window.removeEventListener("auth:expired", handleExpired as EventListener);
  }, [logout, navigate]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Launch />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/launch" element={<Launch />} />
        <Route path="/app" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="/meal-plans" element={<ProtectedRoute><MealPlans /></ProtectedRoute>} />
        <Route path="/shopping" element={<ProtectedRoute><ShoppingLists /></ProtectedRoute>} />
        <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
        <Route path="/macros" element={<ProtectedRoute><Macros /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};
