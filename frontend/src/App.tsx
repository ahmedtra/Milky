import React, { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner"; // Using sonner for easy feedback
import NoSleep from "nosleep.js";

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

const queryClient = new QueryClient();

const App = () => {
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const noSleepRef = useRef<NoSleep | null>(null);

  // Handler for the checkbox toggle
  const handleToggleWakeLock = async (checked: boolean) => {
    if (checked) {
      try {
        if (!noSleepRef.current) {
          noSleepRef.current = new NoSleep();
        }
        await noSleepRef.current.enable(); // must be triggered from user gesture
        setWakeLockEnabled(true);
        toast.success("Screen will stay awake!");
      } catch (err: any) {
        console.error("NoSleep enable failed:", err?.message || err);
        setWakeLockEnabled(false);
        toast.error("Could not keep the screen awake on this device.");
      }
    } else {
      try {
        await noSleepRef.current?.disable?.();
      } catch {
        /* ignore */
      }
      noSleepRef.current = null;
      setWakeLockEnabled(false);
      toast.info("Screen wake lock disabled.");
    }
  };

  useEffect(() => {
    return () => {
      try {
        noSleepRef.current?.disable?.();
      } catch {
        /* ignore */
      }
      noSleepRef.current = null;
    };
  }, []);

  const WakeLockBar: React.FC = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();

    const handleDisconnect = async () => {
      await handleToggleWakeLock(false);
      logout();
      navigate("/login");
    };

    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] w-[340px] max-w-[92vw] flex items-center justify-between gap-3 rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow-lg px-4 py-2 transition-all hover:bg-white pointer-events-auto">
        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            className="accent-green-500 h-5 w-5 rounded-md cursor-pointer"
            checked={wakeLockEnabled}
            onChange={(e) => handleToggleWakeLock(e.target.checked)}
          />
          Keep Screen On
        </label>
        <button
          type="button"
          className="text-xs font-semibold px-3 py-1 rounded-full border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          onClick={handleDisconnect}
        >
          Disconnect
        </button>
      </div>
    );
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" />

        <BrowserRouter>
          <AuthProvider>
            <AppRoutes WakeLockBar={WakeLockBar} />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

const AppRoutes = ({ WakeLockBar }: { WakeLockBar: React.FC }) => {
  const location = useLocation();
  const hideBar = ["/", "/launch", "/login", "/register"].includes(location.pathname);

  return (
    <>
      {!hideBar && <WakeLockBar />}
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
