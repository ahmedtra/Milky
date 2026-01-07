import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ChefHat, ShoppingCart, MessageCircle, Menu, X, LayoutDashboard, Soup, Heart, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/meal-plans", label: "Meal Plans", icon: Soup },
  { path: "/shopping", label: "Shopping", icon: ShoppingCart },
  { path: "/favorites", label: "Favorites", icon: Heart },
  { path: "/macros", label: "Macros", icon: BarChart3 },
  { path: "/chat", label: "AI Chat", icon: MessageCircle },
];

export function Navigation({ showLinks = true }: { showLinks?: boolean }) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav className="mx-4 mt-4 md:mx-8 md:mt-6">
        <div className="glass-card-elevated px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary shadow-soft">
                <span className="text-lg font-bold text-primary-foreground">M</span>
              </div>
              <span className="text-xl font-semibold text-foreground">Milky</span>
            </Link>

            {/* Desktop Navigation */}
            {showLinks && (
              <div className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link key={item.path} to={item.path}>
                      <motion.div
                        className={cn(
                          "relative flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-soft"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="font-medium text-sm">{item.label}</span>
                        {isActive && (
                          <span className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-primary-foreground/80" />
                        )}
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

          {/* Mobile Navigation */}
          {showLinks && mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-border md:hidden"
            >
              <div className="flex flex-col gap-2">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="font-medium">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      </nav>
    </header>
  );
}
