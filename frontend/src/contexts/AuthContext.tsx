import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

type User = {
  _id?: string;
  id?: string;
  email?: string;
  username?: string;
  [key: string]: any;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, username?: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null));
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMe = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<{ user: User }>("/api/users/me");
      setUser(data.user);
    } catch (err) {
      console.warn("Failed to fetch current user", err);
      // Keep token so user can still access protected routes; user will remain null until next successful fetch
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    try {
      const data = await apiRequest<{ token: string; user: User }>("/api/users/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      setUser(data.user);
      if (typeof window !== "undefined") {
        localStorage.setItem("token", data.token);
      }
      return true;
    } catch (err) {
      console.error("Login failed", err);
      return false;
    }
  };

  const register = async (email: string, password: string, username?: string) => {
    try {
      const data = await apiRequest<{ token: string; user: User }>("/api/users/register", {
        method: "POST",
        body: JSON.stringify({ email, password, username }),
      });
      setToken(data.token);
      setUser(data.user);
      if (typeof window !== "undefined") {
        localStorage.setItem("token", data.token);
      }
      return true;
    } catch (err) {
      console.error("Register failed", err);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
  };

  const value: AuthContextValue = {
    user,
    token,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
