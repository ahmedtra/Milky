import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import MealPlans from "./pages/MealPlans";
import ShoppingLists from "./pages/ShoppingLists";
import Chat from "./pages/Chat";
import Favorites from "./pages/Favorites";
import Macros from "./pages/Macros";
import NotFound from "./pages/NotFound";
import Login from "./pages/Auth/Login";
import Register from "./pages/Auth/Register";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route
              path="/meal-plans"
              element={
                <ProtectedRoute>
                  <MealPlans />
                </ProtectedRoute>
              }
            />
            <Route
              path="/shopping"
              element={
                <ProtectedRoute>
                  <ShoppingLists />
                </ProtectedRoute>
              }
            />
            <Route
              path="/favorites"
              element={
                <ProtectedRoute>
                  <Favorites />
                </ProtectedRoute>
              }
            />
            <Route
              path="/macros"
              element={
                <ProtectedRoute>
                  <Macros />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
