import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { Navigation } from "@/components/layout/Navigation";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const success = await register(email, password, username);
    setLoading(false);
    if (success) {
      navigate("/dashboard", { replace: true });
    } else {
      setError("Registration failed. Try again.");
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
          <h1 className="text-2xl font-bold text-foreground mb-1">Create account</h1>
          <p className="text-muted-foreground mb-6">Join and start planning your meals.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="h-11"
              />
            </div>
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
              {loading ? "Creating..." : "Create account"}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground mt-4 text-center">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-semibold">
              Sign in
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
