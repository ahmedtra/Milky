import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, ChevronDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface MacroData {
  label: string;
  value: number;
  max: number;
  color: string;
}

interface MealCardProps {
  name: string;
  calories: number;
  image: string;
  day?: string;
  macros?: MacroData[];
}

export function MealCard({ name, calories, image, day, macros }: MealCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const defaultMacros: MacroData[] = macros || [
    { label: "Protein", value: 32, max: 50, color: "bg-primary" },
    { label: "Carbs", value: 45, max: 60, color: "bg-amber-400" },
    { label: "Fats", value: 18, max: 30, color: "bg-rose-400" },
  ];

  return (
    <motion.div
      layout
      className={cn(
        "glass-card overflow-hidden cursor-pointer",
        "min-w-[280px] md:min-w-[300px]"
      )}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Image Container */}
      <div className="relative h-40 md:h-48 overflow-hidden">
        <img
          src={image}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        
        {/* Day Badge */}
        {day && (
          <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-card/80 backdrop-blur-md text-xs font-medium text-foreground">
            {day}
          </div>
        )}

        {/* Calorie Badge */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/80 backdrop-blur-md">
          <Flame className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-semibold text-foreground">{calories} kcal</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-lg">{name}</h3>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          </motion.div>
        </div>

        {/* Expanded Macros */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4 space-y-3"
            >
              {defaultMacros.map((macro) => (
                <div key={macro.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{macro.label}</span>
                    <span className="font-medium text-foreground">
                      {macro.value}g / {macro.max}g
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(macro.value / macro.max) * 100}%` }}
                      transition={{ duration: 0.5, delay: 0.1 }}
                      className={cn("h-full rounded-full", macro.color)}
                    />
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
