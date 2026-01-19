import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ChefHat, ShoppingCart, MessageCircle, 
  Calendar, CheckCircle, Clock, Flame, Sparkles, AlertTriangle, ChevronLeft, ChevronRight, Star, RefreshCw 
} from "lucide-react";
import { Navigation } from "@/components/layout/Navigation";
import { Button } from "@/components/ui/button";
import { useMealPlans, useActiveMealPlan, useToggleMealCompletion, useUpdateMealPlanDays } from "@/hooks/use-meal-plans";
import { useShoppingLists } from "@/hooks/use-shopping-lists";
import { getMealCalories, getPlanId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getMealAlternatives, applyMealAlternative, ensureMealImage, getFavoriteRecipes, saveFavoriteRecipe, ensureFavoriteImage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { CookMode } from "@/components/meals/CookMode";

const quickLinks = [
  { path: "/meal-plans", label: "Meal Plans", icon: ChefHat, description: "View & generate plans" },
  { path: "/shopping", label: "Shopping Lists", icon: ShoppingCart, description: "Manage your lists" },
  { path: "/chat", label: "AI Nutritionist", icon: MessageCircle, description: "Get personalized advice" },
];

export default function Dashboard() {
  const { data: plans, isLoading: plansLoading } = useMealPlans();
  const { data: activePlan } = useActiveMealPlan();
  const { data: shoppingLists, isLoading: listsLoading } = useShoppingLists();
  const toggleMealMutation = useToggleMealCompletion();
  const updateDaysMutation = useUpdateMealPlanDays();
  const queryClient = useQueryClient();
  const [historyCardPct, setHistoryCardPct] = useState(90);
  const historyInitialized = useRef(false);

  // Stats
  const planList = Array.isArray(plans) ? plans : [];
  const shoppingListArr = Array.isArray(shoppingLists) ? shoppingLists : [];
  const mealPlanCount = planList.length;
  const shoppingListCount = shoppingListArr.length;
  const completedListCount = shoppingListArr.filter(l => l.status === 'completed').length;
  const activePlans = planList.filter(p => p.status === 'active');
  const [historyIndex, setHistoryIndex] = useState(0);
  const [swapState, setSwapState] = useState<{ key: string | null; options: any[]; loading: boolean; applying: boolean }>({
    key: null,
    options: [],
    loading: false,
    applying: false,
  });
  const [favorites, setFavorites] = useState<{ items: any[]; loading: boolean }>({ items: [], loading: false });
  const historyTouchStart = useRef<number | null>(null);

  // Get today's meals from the plan whose date range covers today
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const normalizeDate = (val?: string) => {
    if (!val) return "";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  };

  const normalizeName = (value?: string | null) =>
    (value || "")
      .toString()
      .toLowerCase()
      .trim();

  const favoriteNameSet = React.useMemo(() => {
    const set = new Set<string>();
    (favorites.items || []).forEach((fav: any) => {
      const name = fav?.name || fav?.title;
      const norm = normalizeName(name);
      if (norm) set.add(norm);
    });
    return set;
  }, [favorites.items]);

  // Preload favorites so meal highlighting works without opening swap
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        setFavorites((prev) => ({ ...prev, loading: true }));
        const favs = await getFavoriteRecipes();
        setFavorites({ items: favs, loading: false });
      } catch (err) {
        console.error("Error loading favorites", err);
        setFavorites({ items: [], loading: false });
      }
    };
    if (!favorites.loading && favorites.items.length === 0) {
      loadFavorites();
    }
  }, [favorites.items.length, favorites.loading]);

  const planCoversToday = (plan: any) => {
    if (!plan) return false;
    const start = normalizeDate((plan as any).startDate);
    if (!start) return false;
    const end =
      normalizeDate((plan as any).endDate) ||
      (() => {
        const d = new Date(start);
        const len = Array.isArray(plan.days) ? plan.days.length : 0;
        d.setDate(d.getDate() + Math.max(0, len - 1));
        return normalizeDate(d.toISOString());
      })();
    return todayStr >= start && todayStr <= end;
  };

  const resolveTodayContext = () => {
    const plan = activePlans.find(planCoversToday) || (planCoversToday(activePlan) ? activePlan : null);
    if (!plan?.days) return { plan: null, day: undefined, index: -1 };

    // Direct match on stored date
    let idx = plan.days.findIndex((d: any) => normalizeDate(d.date) === todayStr);
    if (idx >= 0) return { plan, day: plan.days[idx], index: idx };

    // Compute offset from startDate
    const start = normalizeDate((plan as any).startDate);
    if (start) {
      for (let i = 0; i < plan.days.length; i++) {
        const base = new Date(start);
        base.setDate(base.getDate() + i);
        if (normalizeDate(base.toISOString()) === todayStr) {
          return { plan, day: plan.days[i], index: i };
        }
      }
    }

    // No active plan covering today
    return { plan: null, day: undefined, index: -1 };
  };

  const { plan: todayPlan, day: todayDay, index: todayDayIndex } = resolveTodayContext();
  const getPlanById = (id: string) => planList.find(p => getPlanId(p) === id);
  const imageRequested = useRef<Set<string>>(new Set());
  const [expandedMeal, setExpandedMeal] = useState<{
    meal: any;
    recipe: any;
    ingredients: string[];
    instructions: string[];
    instructionsArray: string[];
  } | null>(null);
  const [cookMode, setCookMode] = useState<{ title: string; steps: string[] } | null>(null);

  const historyData = useMemo(() => {
    const groups: Record<string, { planId: string; dayIndex: number; planTitle: string; dayLabel: string; meals: any[]; createdAt: number; overlap: boolean }> = {};
    const overlaps: string[] = [];

    const toDateOnly = (val?: string) => {
      if (!val) return null;
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    activePlans.forEach(plan => {
      const planId = getPlanId(plan);
      if (!planId) return;
      const createdAtTs = plan.createdAt ? new Date(plan.createdAt).getTime() : 0;
      const planStart = toDateOnly((plan as any).startDate) || toDateOnly(plan.createdAt);

      (plan.days || []).forEach((day, idx) => {
        const dayDate = toDateOnly(day.date) || (planStart ? new Date(planStart.getTime() + idx * 86400000) : null);
        const hasRealDate = !!dayDate;
        const dateKey = hasRealDate
          ? dayDate!.toISOString().split("T")[0]
          : `${getPlanId(plan)}-day-${idx}`;
        const label = hasRealDate
          ? dayDate!.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
          : `Day ${idx + 1}`;

        const existing = groups[dateKey];
        if (existing) {
          if (hasRealDate) overlaps.push(dateKey);
          if (createdAtTs > existing.createdAt) {
            groups[dateKey] = {
              planId,
              dayIndex: idx,
              planTitle: plan.title || "Meal Plan",
              dayLabel: label,
              meals: day.meals || [],
              createdAt: createdAtTs,
              overlap: overlaps.includes(dateKey),
            };
          }
        } else {
          groups[dateKey] = {
            planId,
            dayIndex: idx,
            planTitle: plan.title || "Meal Plan",
            dayLabel: label,
            meals: day.meals || [],
            createdAt: createdAtTs,
            overlap: overlaps.includes(dateKey),
          };
        }
      });
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    const entries = sortedKeys.map(key => ({
      key,
      ...groups[key],
      overlap: overlaps.includes(key),
    }));

    return { entries, hasOverlap: overlaps.length > 0 };
  }, [activePlans]);

  useEffect(() => {
    const updateCardPct = () => {
      if (typeof window === "undefined") return;
      setHistoryCardPct(window.innerWidth >= 768 ? 80 : 90);
    };
    updateCardPct();
    window.addEventListener("resize", updateCardPct);
    return () => window.removeEventListener("resize", updateCardPct);
  }, []);

  useEffect(() => {
    if (historyData.entries.length === 0) {
      setHistoryIndex(0);
      historyInitialized.current = false;
      return;
    }
    // Only set on initial load or when entries change from empty to non-empty
    if (historyInitialized.current) return;
    const todayIdx = historyData.entries.findIndex((e) => e.key === todayStr);
    if (todayIdx >= 0) {
      setHistoryIndex(todayIdx);
    } else {
      setHistoryIndex((prev) => Math.min(prev, historyData.entries.length - 1));
    }
    historyInitialized.current = true;
  }, [historyData.entries, todayStr]);

  // Ensure today's meals have images (Leonardo) without spamming requests
  useEffect(() => {
    const planId = todayPlan ? getPlanId(todayPlan) : null;
    if (!planId || !todayDay?.meals?.length) return;
    const dayIndex = todayDayIndex ?? -1;
    if (dayIndex < 0) return;
    todayDay.meals.forEach((meal, idx) => {
      const recipe = meal.recipes?.[0];
      if (recipe?.image || recipe?.imageUrl) return;
      const key = `${planId}-${todayStr}-${idx}`;
      if (imageRequested.current.has(key)) return;
      imageRequested.current.add(key);
      ensureMealImage({ planId, dayIndex, mealIndex: idx })
        .then(() => queryClient.invalidateQueries({ queryKey: ['meal-plans'] }))
        .catch((err) => console.warn("⚠️ ensureMealImage failed", err));
    });
  }, [activePlan, todayDay, todayStr, queryClient]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedMeal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const buildMealDetails = (meal: any) => {
    const recipe = meal?.recipes?.[0] || {};
    const ingredientsList = Array.isArray(recipe.ingredients)
      ? recipe.ingredients
          .map((ing: any) => {
            if (typeof ing === "string") return { name: ing };
            if (ing && typeof ing === "object") {
              return {
                name: ing.name,
                amount: ing.amount,
                unit: ing.unit,
              };
            }
            return null;
          })
          .filter(Boolean)
      : [];
    const instructionsRaw = recipe.instructions;
    let instructionsList: string[] = [];
    const pushSplit = (text: string) => {
      const byLine = text.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
      if (byLine.length > 1) {
        instructionsList.push(...byLine);
      } else {
        const bySentence = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
        instructionsList.push(...(bySentence.length ? bySentence : byLine));
      }
    };
    if (Array.isArray(instructionsRaw)) {
      instructionsRaw.forEach((step: any) => {
        if (typeof step === "string") pushSplit(step);
        else if (step && typeof step === "object" && typeof step.text === "string") pushSplit(step.text);
      });
    } else if (typeof instructionsRaw === "string") {
      pushSplit(instructionsRaw);
    }
    return { recipe, ingredientsList, instructionsList };
  };

  const validId = (id?: string) => !!id && id !== "undefined";
  const swapKeyFor = (planId: string, dayIndex: number, mealIndex: number) => `${planId}-${dayIndex}-${mealIndex}`;

  const handleSwapOpen = async (planId: string, dayIndex: number, mealIndex: number) => {
    if (!validId(planId) || dayIndex === undefined || mealIndex === undefined) {
      toast.error("Swap unavailable for this meal");
      return;
    }
    const key = swapKeyFor(planId, dayIndex, mealIndex);
    const plan = getPlanById(planId);
    if (!plan) {
      toast.error("Swap requires a saved meal plan.");
      return;
    }
    setSwapState({ key, options: [], loading: true, applying: false });
    try {
      const { alternatives } = await getMealAlternatives({ planId, dayIndex, mealIndex, limit: 3 });
      const limited = Array.isArray(alternatives) ? alternatives.slice(0, 3) : [];
      setSwapState({ key, options: limited, loading: false, applying: false });
      if (!limited.length) toast("No alternatives found right now.");
      if (!favorites.items.length) {
        setFavorites({ items: [], loading: true });
        try {
          const favs = await getFavoriteRecipes();
          setFavorites({ items: favs, loading: false });
        } catch (err) {
          console.error("Error loading favorites", err);
          setFavorites({ items: [], loading: false });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load alternatives");
      setSwapState({ key: null, options: [], loading: false, applying: false });
    }
  };

  const handleApplyAlternative = async (planId: string, dayIndex: number, mealIndex: number, recipeId?: string, recipe?: any) => {
    if (!validId(planId)) return;
    const key = swapKeyFor(planId, dayIndex, mealIndex);
    setSwapState(prev => ({ ...prev, applying: true }));
    try {
      await applyMealAlternative({ planId, dayIndex, mealIndex, recipeId, recipe });
      toast.success("Meal swapped");
      setSwapState({ key: null, options: [], loading: false, applying: false });
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] });
    } catch (err) {
      console.error(err);
      toast.error("Failed to apply alternative");
      setSwapState(prev => ({ ...prev, applying: false }));
    }
  };

  const handleDeleteMeal = (planId: string, dayIndex: number, mealIndex: number) => {
    if (!validId(planId)) return;
    const plan = getPlanById(planId);
    if (!plan?.days) return;
    const newDays = plan.days.map((d, idx) =>
      idx === dayIndex ? { ...d, meals: (d.meals || []).filter((_, mIdx) => mIdx !== mealIndex) } : d
    );
    updateDaysMutation.mutate(
      { planId, days: newDays },
      {
        onSuccess: () => {
          toast.success("Meal removed");
          queryClient.invalidateQueries({ queryKey: ['meal-plans'] });
        },
        onError: () => toast.error("Failed to remove meal"),
      }
    );
  };

  const handleToggleMeal = (planId: string, dayIndex: number, mealIndex: number, isCompleted: boolean) => {
    if (!validId(planId)) return;
    toggleMealMutation.mutate(
      { planId, dayIndex, mealIndex, isCompleted },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meal-plans'] }),
      }
    );
  };

  const handleFavoriteMeal = async (planId: string, dayIndex: number, mealIndex: number) => {
    const plan = getPlanById(planId);
    const meal = plan?.days?.[dayIndex]?.meals?.[mealIndex];
    const recipe = meal?.recipes?.[0];
    if (!meal || !recipe) return;
    try {
      const recipeId = recipe.externalId || recipe.id || recipe._id;
      const nutrition = recipe.nutrition || meal.totalNutrition || undefined;
      const saved = await saveFavoriteRecipe({
        recipeId,
        recipe: {
          title: recipe.name || recipe.title || meal.type || "Recipe",
          name: recipe.name || recipe.title || meal.type || "Recipe",
          ingredients: recipe.ingredients || recipe.ingredients_parsed || [],
          instructions: recipe.instructions || [],
          imageUrl: recipe.imageUrl || recipe.image || null,
          source: "meal",
          nutrition,
        },
      });
      const favId = saved?.favorite?._id || saved?.favorite?.id;
      if (favId) {
        try {
          await ensureFavoriteImage(favId);
        } catch (err) {
          console.warn("Could not ensure favorite image", err);
        }
      }
      toast.success("Saved to favorites");
    } catch (err) {
      console.error(err);
      toast.error("Could not save favorite");
    }
  };

  const handleHistoryTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    historyTouchStart.current = e.touches[0].clientX;
  };
  const handleHistoryTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (historyTouchStart.current === null) return;
    const deltaX = e.changedTouches[0].clientX - historyTouchStart.current;
    historyTouchStart.current = null;
    const threshold = 40;
    if (Math.abs(deltaX) > threshold) {
      if (deltaX < 0 && historyIndex < historyData.entries.length - 1) {
        setHistoryIndex((idx) => Math.min(historyData.entries.length - 1, idx + 1));
      } else if (deltaX > 0 && historyIndex > 0) {
        setHistoryIndex((idx) => Math.max(0, idx - 1));
      }
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 mb-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">AI-Powered Nutrition</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-3">
              Welcome to Milky
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Your personalized AI diet assistant for healthier living
            </p>
          </motion.div>

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12"
          >
            {quickLinks.map((link) => (
              <Link key={link.path} to={link.path}>
                <motion.div
                  className="glass-card p-5 flex items-center gap-4 cursor-pointer"
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                    <link.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{link.label}</p>
                    <p className="text-sm text-muted-foreground">{link.description}</p>
                  </div>
                </motion.div>
              </Link>
            ))}
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12"
          >
            <div className="glass-card p-5 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <ChefHat className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {plansLoading ? "—" : mealPlanCount}
                </p>
                <p className="text-sm text-muted-foreground">Meal Plans</p>
              </div>
            </div>
            <div className="glass-card p-5 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <ShoppingCart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {listsLoading ? "—" : shoppingListCount}
                </p>
                <p className="text-sm text-muted-foreground">Shopping Lists</p>
              </div>
            </div>
            <div className="glass-card p-5 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {listsLoading ? "—" : completedListCount}
                </p>
                <p className="text-sm text-muted-foreground">Completed Lists</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Today's Meals */}
      <section className="pb-32 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-6">
              Today's Meals
            </h2>

            {!todayDay?.meals?.length ? (
              <div className="glass-card p-8 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No meals scheduled for today</p>
                <Link to="/meal-plans">
                  <Button variant="primary">Create a Meal Plan</Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {todayDay.meals.map((meal, index) => {
                  const { recipe, ingredientsList, instructionsList } = buildMealDetails(meal);
                  const instructionsArray = Array.isArray(instructionsList)
                    ? instructionsList
                    : typeof instructionsList === "string"
                      ? instructionsList.split(/\r?\n/).filter(Boolean)
                      : [];
                  const calories = getMealCalories(meal);

                  return (
                    <motion.div
                      key={meal.mealId || meal._id || index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + index * 0.1 }}
                      className="glass-card p-5"
                    >
                      {recipe?.image || recipe?.imageUrl ? (
                        <div className="mb-3 overflow-hidden rounded-xl">
                          <img
                            src={recipe.image || recipe.imageUrl}
                            alt={recipe.name || meal.type}
                            className="w-full h-40 object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {meal.scheduledTime || "—"}
                            </span>
                          </div>
                          {meal.type && (
                            <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                              {meal.type}
                            </span>
                          )}
                        </div>
                        {meal.isCompleted && (
                          <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                            Completed
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-foreground mb-1">
                        <button
                          className="text-left hover:underline"
                          onClick={() =>
                            setExpandedMeal({
                              meal,
                              recipe,
                              ingredients: ingredientsList,
                              instructions: instructionsList,
                              instructionsArray,
                            })
                          }
                        >
                          {recipe?.name || meal.type}
                        </button>
                      </h3>
                      {recipe?.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {recipe.description}
                        </p>
                      )}
                      {calories && (
                        <div className="flex items-center gap-1.5 mt-3">
                          <Flame className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium text-foreground">{calories} kcal</span>
                        </div>
                      )}
                      <div className="mt-3 flex justify-between items-center">
                        <div className="text-xs text-muted-foreground">
                          {recipe.servings ? `${recipe.servings} serving${recipe.servings > 1 ? "s" : ""}` : "Serves 1"}
                        </div>
                        <button
                          className="text-sm text-primary font-semibold"
                          onClick={() =>
                            setExpandedMeal({
                              meal,
                              recipe,
                              ingredients: ingredientsList,
                              instructions: instructionsList,
                              instructionsArray,
                            })
                          }
                        >
                          Show ingredients & steps
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Expanded meal overlay */}
      {expandedMeal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4 py-6"
          onClick={() => setExpandedMeal(null)}
        >
          <div
            className="glass-card-elevated w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setExpandedMeal(null)}
            >
              Close
            </button>
            <div className="space-y-4">
              {expandedMeal.recipe?.image || expandedMeal.recipe?.imageUrl ? (
                <div className="overflow-hidden rounded-2xl">
                  <img
                    src={expandedMeal.recipe.image || expandedMeal.recipe.imageUrl}
                    alt={expandedMeal.recipe.name || "Meal image"}
                    className="w-full h-64 object-cover"
                  />
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-primary font-semibold">Meal</p>
                  <h3 className="text-2xl font-bold text-foreground">
                    {expandedMeal.recipe?.name || expandedMeal.meal?.type || "Meal"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {expandedMeal.meal?.type ? expandedMeal.meal.type : ""}
                  </p>
                </div>
              </div>
              <div className="grid gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Ingredients</p>
                  {expandedMeal.ingredients.length ? (
                    <ul className="list-disc list-inside text-sm text-foreground space-y-1">
                      {expandedMeal.ingredients.map((ing: any, i) => {
                        const parts = [ing.amount, ing.unit, ing.name].filter(Boolean).join(" ");
                        return <li key={i}>{parts || ing.name || "Ingredient"}</li>;
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No ingredients available.</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Instructions</p>
                  {expandedMeal.instructionsArray?.length ? (
                    <div className="space-y-1 text-sm text-foreground break-words">
                      {expandedMeal.instructionsArray.map((step: string, i) => (
                        <div key={i} className="flex gap-2 text-left">
                          <span className="font-semibold text-primary">{i + 1}.</span>
                          <span className="flex-1 whitespace-pre-wrap">{step}</span>
                        </div>
                      ))}
                    </div>
                  ) : expandedMeal.instructions.length ? (
                    <ol className="list-decimal list-inside text-sm text-foreground space-y-1">
                      {expandedMeal.instructions.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">No instructions available.</p>
                  )}
                </div>
              </div>
              {expandedMeal.instructionsArray?.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    onClick={() =>
                      setCookMode({
                        title: expandedMeal.recipe?.name || expandedMeal.meal?.type || "Recipe",
                        steps: expandedMeal.instructionsArray,
                      })
                    }
                  >
                    Start Cook Mode
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {cookMode && (
        <CookMode
          title={cookMode.title}
          steps={cookMode.steps}
          onExit={() => setCookMode(null)}
        />
      )}

      {/* Active Meal Plans history */}
      <section className="pb-32 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg md:text-2xl font-semibold text-foreground">
                Active Meal Plan History
              </h2>
            </div>

            {activePlans.length === 0 ? (
              <div className="glass-card p-6 text-sm text-muted-foreground">
                No active plans. Activate a plan to see its day-by-day meals.
              </div>
            ) : (
              <div className="space-y-3">
                {historyData.hasOverlap && (
                  <div className="glass-card p-4 text-sm flex items-start gap-3 text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <div>
                      Overlapping days detected across active plans. Please adjust start dates; showing the most recent plan in red.
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs md:text-sm">
                  <div className="text-sm text-muted-foreground">
                    {historyData.entries.length ? `${historyIndex + 1} / ${historyData.entries.length}` : "0 / 0"}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      onClick={() => setHistoryIndex((idx) => Math.max(0, idx - 1))}
                      disabled={historyIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      onClick={() => setHistoryIndex((idx) => Math.min(historyData.entries.length - 1, idx + 1))}
                      disabled={historyIndex >= historyData.entries.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div
                  className="overflow-hidden"
                  onTouchStart={handleHistoryTouchStart}
                  onTouchEnd={handleHistoryTouchEnd}
                >
                  <div
                    className="flex gap-4 transition-transform duration-300 ease-out"
                    style={{
                      // Center the active card while allowing neighbors to peek.
                      transform: (() => {
                        const CARD_PCT = historyCardPct; // card width percent (match width class below)
                        const GAP_PX = 16;   // gap-4
                        const centerOffset = (100 - CARD_PCT) / 2;
                        return `translateX(calc(-${historyIndex * CARD_PCT}% - ${historyIndex * GAP_PX}px + ${centerOffset}%))`;
                      })(),
                    }}
                  >
                    {historyData.entries.map((entry, idx) => {
                      const isActive = idx === historyIndex;
                      return (
                        <div
                          key={entry.key}
                          className={cn(
                            "p-4 md:p-5 rounded-2xl shrink-0 w-[90%] md:w-[80%] transition-all duration-300 bg-white/95 shadow-[0_30px_70px_-40px_rgba(0,0,0,0.55)]",
                            isActive ? "scale-[1.01]" : "opacity-80"
                          )}
                        >
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                            <div className="min-w-0">
                              <p className="text-xs md:text-sm text-muted-foreground">{entry.dayLabel}</p>
                              <h3 className="font-semibold text-foreground text-sm md:text-base truncate">{entry.planTitle}</h3>
                            </div>
                            {entry.overlap && (
                              <span className="px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-semibold">
                                Overlap: showing most recent
                              </span>
                            )}
                          </div>
                          {entry.meals.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No meals scheduled for this day.</p>
                          ) : (
                            <div className="space-y-2">
                              {entry.meals.map((meal, mealIdx) => {
                                const mealKey = meal.mealId || meal._id || mealIdx;
                                const isSwapOpen = validId(entry.planId) && swapState.key === swapKeyFor(entry.planId, entry.dayIndex, mealIdx);
                                const recipe = meal?.recipes?.[0] || {};
                                const recipeName = recipe?.name || recipe?.title || "";
                                const isLlmFallback = Array.isArray(recipe?.tags) && recipe.tags.includes("llm-fallback");
                                const isFavorite = !!recipeName && favoriteNameSet.has(normalizeName(recipeName)) && !isSwapOpen;
                                return (
                                  <div
                                    key={mealKey}
                                    className={cn(
                                      "space-y-2 rounded-lg p-3 bg-white/85 shadow-[0_12px_30px_-25px_rgba(0,0,0,0.6)]",
                                      isFavorite && "border border-amber-300 bg-amber-50/80 shadow-[0_16px_40px_-18px_rgba(245,158,11,0.45)]"
                                    )}
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                      <div className="min-w-0">
                                        <p className="font-semibold text-foreground text-sm md:text-base leading-snug line-clamp-2">
                                          {recipe.name || meal.type || "Meal"}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate flex items-center gap-2">
                                          <span>{meal.type || "Meal"}</span>
                                          {Array.isArray(recipe.tags) && recipe.tags.includes("llm-fallback") && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                                              <Sparkles className="h-3 w-3 text-primary" />
                                              AI generated
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                      <div className="flex gap-2 shrink-0 flex-wrap justify-end w-full sm:w-auto sm:ml-auto sm:justify-end">
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          disabled={!validId(entry.planId)}
                                          onClick={() => handleSwapOpen(entry.planId, entry.dayIndex, mealIdx)}
                                          className="flex items-center gap-1"
                                        >
                                          <RefreshCw className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant={meal.isCompleted ? "outline" : "secondary"}
                                          size="sm"
                                          onClick={() =>
                                            handleToggleMeal(
                                              entry.planId,
                                              entry.dayIndex,
                                              mealIdx,
                                              !meal.isCompleted
                                            )
                                          }
                                          className={cn(
                                            "flex items-center gap-1",
                                            meal.isCompleted ? "border-green-500 text-green-600" : ""
                                          )}
                                        >
                                          ✓
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleFavoriteMeal(entry.planId, entry.dayIndex, mealIdx)}
                                          className={cn(
                                            "text-amber-500 hover:text-amber-600",
                                            isFavorite && "ring-2 ring-amber-200 shadow-sm"
                                          )}
                                        >
                                          <Star
                                            className={cn(
                                              "h-5 w-5 fill-amber-400 text-amber-500",
                                              isFavorite && "drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                                            )}
                                          />
                                        </Button>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => handleDeleteMeal(entry.planId, entry.dayIndex, mealIdx)}
                                        >
                                          X
                                        </Button>
                                      </div>
                                    </div>
                                      {isSwapOpen && (
                                      <div className="rounded-lg bg-secondary p-3 space-y-3">
                                        {swapState.loading ? (
                                          <p className="text-sm text-muted-foreground">Loading alternatives...</p>
                                        ) : swapState.options.length ? (
                                          <div className="space-y-2">
                                            {swapState.options.map((opt: any, altIdx: number) => (
                                              <div key={altIdx} className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                  <p className="text-sm font-semibold text-foreground truncate">
                                                    {opt?.title || opt?.name || "Recipe"}
                                                  </p>
                                                  <p className="text-xs text-muted-foreground truncate">
                                                    {opt?.description || opt?.summary || "Alternative recipe"}
                                                  </p>
                                                </div>
                                                <Button
                                                  variant="default"
                                                  size="sm"
                                                  className="shrink-0"
                                                  disabled={swapState.applying}
                                                  onClick={() =>
                                                    handleApplyAlternative(
                                                      entry.planId,
                                                      entry.dayIndex,
                                                      mealIdx,
                                                      opt?.recipeId || opt?._id || opt?.id,
                                                      opt?.recipe
                                                    )
                                                  }
                                                >
                                                  {swapState.applying ? "..." : "Use"}
                                                </Button>
                                              </div>
                                            ))}
                                          </div>
                                        ) : null}

                                        {favorites.items.length > 0 ? (
                                          <div className="pt-2 border-t border-border/60">
                                            <p className="text-xs font-semibold text-muted-foreground mb-2">Favorites</p>
                                            <div className="flex gap-2 overflow-x-auto pb-1">
                                              {favorites.items.map((fav, idx) => {
                                                const img =
                                                  fav?.planRecipe?.image ||
                                                  fav?.planRecipe?.imageUrl ||
                                                  fav?.image ||
                                                  fav?.imageUrl ||
                                                  fav?.recipe?.image ||
                                                  fav?.recipe?.imageUrl;
                                                return (
                                                  <button
                                                    key={idx}
                                                    className="flex flex-col items-start gap-2 px-3 py-2 rounded-lg border bg-white text-left min-w-[200px] max-w-[240px] hover:border-primary/50"
                                                    onClick={() =>
                                                      handleApplyAlternative(
                                                        entry.planId,
                                                        entry.dayIndex,
                                                        mealIdx,
                                                        fav?.externalId || fav?.recipeId || fav?.id || undefined,
                                                        fav?.planRecipe || fav?.recipe || fav
                                                      )
                                                    }
                                                  >
                                                    {img ? (
                                                      <img
                                                        src={img}
                                                        alt={fav?.title || fav?.name || fav?.planRecipe?.title || "Favorite"}
                                                        className="w-full h-24 rounded-md object-cover border border-border/50"
                                                      />
                                                    ) : (
                                                      <div className="w-full h-24 rounded-md bg-secondary flex items-center justify-center text-[11px] text-muted-foreground border border-border/50">
                                                        No image
                                                      </div>
                                                    )}
                                                    <div className="min-w-0 w-full">
                                                      <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                                                        {fav?.title || fav?.name || fav?.planRecipe?.title || fav?.planRecipe?.name || "Favorite"}
                                                      </p>
                                                      <p className="text-xs text-muted-foreground line-clamp-2">
                                                        {fav?.planRecipe?.description || fav?.description || ""}
                                                      </p>
                                                    </div>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-sm text-muted-foreground">No alternatives found.</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                             })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
