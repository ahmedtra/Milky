import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GenerateButtonProps {
  onClick?: () => void;
}

export function GenerateButton({ onClick }: GenerateButtonProps) {
  return (
    <motion.div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
    >
      <Button
        variant="hero"
        size="xl"
        onClick={onClick}
        className="group relative overflow-hidden"
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-primary/0 via-white/20 to-primary/0"
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        />
        <Sparkles className="h-5 w-5 transition-transform group-hover:rotate-12" />
        <span className="relative">Generate AI Plan</span>
      </Button>
    </motion.div>
  );
}
