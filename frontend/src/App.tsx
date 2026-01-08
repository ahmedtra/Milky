import React, { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => {
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const wakeLockRef = useRef<any>(null);

  // Core function to request the lock
  const requestWakeLock = useCallback(async (silent = false) => {
    if (!("wakeLock" in navigator)) {
      if (!silent) toast.error("Wake Lock not supported on this browser.");
      return false;
    }
    
    // Safety check for HTTPS
    if (!window.isSecureContext) {
      if (!silent) toast.error("Wake Lock requires HTTPS.");
      return false;
    }

    try {
      // @ts-ignore
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;

      sentinel.onrelease = () => {
        console.log("Wake Lock released");
        wakeLockRef.current = null;
        // We don't necessarily setWakeLockEnabled(false) here because 
        // the user might just have minimized the app temporarily.
      };

      if (!silent) toast.success("Screen will stay awake!");
      return true;
    } catch (err: any) {
      console.error(`Wake Lock Error: ${err.name}, ${err.message}`);
      return false;
    }
  }, []);

  // Handler for the checkbox toggle
  const handleToggleWakeLock = async (checked: boolean) => {
    if (checked) {
      const success = await requestWakeLock();
      setWakeLockEnabled(success);
    } else {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      setWakeLockEnabled(false);
      toast.info("Screen wake lock disabled.");
    }
  };

  // Re-acquire lock when user returns to the tab
  useEffect(() => {
    const handleVisibility = async () => {
      if (wakeLockEnabled && document.visibilityState === "visible" && !wakeLockRef.current) {
        // Re-requesting silently on return
        await requestWakeLock(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release?.();
    };
  }, [wakeLockEnabled, requestWakeLock]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" />
        
        {/* Floating UI Toggle for Milky */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-full bg-white/80 backdrop-blur-md border border-slate-200 shadow-lg px-4 py-2 transition-all hover:bg-white">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-green-500 h-5 w-5 rounded-md cursor-pointer"
              checked={wakeLockEnabled}
              onChange={(e) => handleToggleWakeLock(e.target.checked)}
            />
            Keep Screen On
          </label>
        </div>

        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/meal-plans" element={<ProtectedRoute><MealPlans /></ProtectedRoute>} />
              <Route path="/shopping" element={<ProtectedRoute><ShoppingLists /></ProtectedRoute>} />
              <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
              <Route path="/macros" element={<ProtectedRoute><Macros /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;