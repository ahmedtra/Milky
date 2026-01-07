import { useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Calendar, TrendingUp } from "lucide-react";
import { Navigation } from "@/components/layout/Navigation";
import { MealCard } from "@/components/meals/MealCard";
import { GenerateButton } from "@/components/meals/GenerateButton";
import { Button } from "@/components/ui/button";

const weeklyMeals = [
  {
    day: "Monday",
    name: "Mediterranean Bowl",
    calories: 520,
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop",
  },
  {
    day: "Tuesday",
    name: "Grilled Salmon",
    calories: 480,
    image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&auto=format&fit=crop",
  },
  {
    day: "Wednesday",
    name: "Quinoa Buddha Bowl",
    calories: 450,
    image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop",
  },
  {
    day: "Thursday",
    name: "Chicken Stir Fry",
    calories: 550,
    image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800&auto=format&fit=crop",
  },
  {
    day: "Friday",
    name: "Veggie Tacos",
    calories: 420,
    image: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&auto=format&fit=crop",
  },
  {
    day: "Saturday",
    name: "Poke Bowl",
    calories: 490,
    image: "https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=800&auto=format&fit=crop",
  },
  {
    day: "Sunday",
    name: "Avocado Toast Deluxe",
    calories: 380,
    image: "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=800&auto=format&fit=crop",
  },
];

const stats = [
  { label: "Daily Average", value: "1,850", unit: "kcal" },
  { label: "Weekly Goal", value: "87%", unit: "achieved" },
  { label: "Meals Planned", value: "21", unit: "this week" },
];

export default function MealPlanner() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -320 : 320;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section className="pt-32 md:pt-40 pb-8 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-3">
              Your Weekly Meal Plan
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Personalized nutrition crafted by AI, tailored to your goals
            </p>
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12"
          >
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className="glass-card p-5 flex items-center gap-4"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  {index === 0 && <Calendar className="h-6 w-6 text-primary" />}
                  {index === 1 && <TrendingUp className="h-6 w-6 text-primary" />}
                  {index === 2 && <Calendar className="h-6 w-6 text-primary" />}
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">
                    {stat.label} · {stat.unit}
                  </p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* 7-Day Meal Scroll */}
      <section className="pb-32 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex items-center justify-between mb-6"
          >
            <h2 className="text-xl md:text-2xl font-semibold text-foreground">
              7-Day Meal Schedule
            </h2>
            <div className="hidden md:flex gap-2">
              <Button
                variant="glass"
                size="icon"
                onClick={() => scroll("left")}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="glass"
                size="icon"
                onClick={() => scroll("right")}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </motion.div>

          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 -mx-4 px-4"
          >
            {weeklyMeals.map((meal, index) => (
              <motion.div
                key={meal.day}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <MealCard
                  day={meal.day}
                  name={meal.name}
                  calories={meal.calories}
                  image={meal.image}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Floating Generate Button */}
      <GenerateButton onClick={() => console.log("Generate AI Plan")} />
    </div>
  );
}
