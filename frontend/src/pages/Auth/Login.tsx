import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { Navigation } from "@/components/layout/Navigation";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const success = await login(email, password);
    setLoading(false);
    if (success) {
      navigate("/dashboard", { replace: true });
    } else {
      setError("Login failed. Check your credentials.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="px-4 md:px-8 pt-6 relative z-20">
        <Navigation showLinks={false} />
      </header>
      <main className="pt-16 md:pt-24 pb-10 px-4 md:px-8 flex justify-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card-elevated w-full max-w-md p-6 mt-4"
        >
          <h1 className="text-2xl font-bold text-foreground mb-1">Welcome back</h1>
          <p className="text-muted-foreground mb-6">Sign in to continue.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground mt-4 text-center">
            No account?{" "}
            <Link to="/register" className="text-primary font-semibold">
              Register
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
