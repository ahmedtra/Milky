import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ChefHat, Calendar, Sparkles, TrendingUp, Trash2 } from "lucide-react";
import { Navigation } from "@/components/layout/Navigation";
import { Button } from "@/components/ui/button";
import { useMealPlans, useActiveMealPlan, useGenerateMealPlan, useActivateMealPlan, useToggleMealCompletion, useUpdateMealPlanDays, useUpdateMealPlanStatus, useDeleteMealPlan, getMealCountFromPlan } from "@/hooks/use-meal-plans";
import { GeneratePlanModal, type GeneratePlanFormData } from "@/components/meals/GeneratePlanModal";
import { toast } from "sonner";
import { getPlanId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getMealAlternatives, applyMealAlternative, getFavoriteRecipes } from "@/lib/api";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DayDetailDialog } from "@/components/meals/DayDetailDialog";
import { MealDetailDialog } from "@/components/meals/MealDetailDialog";

export default function MealPlans() {
  const [showModal, setShowModal] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ planId: string; dayIndex: number } | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<{ planId: string; dayIndex: number; mealIndex: number } | null>(null);
  const [startDateDraft, setStartDateDraft] = useState<string>("");
  const [swapState, setSwapState] = useState<{ key: string | null; options: any[]; loading: boolean; applying: boolean }>({
    key: null,
    options: [],
    loading: false,
    applying: false,
  });
  const [favorites, setFavorites] = useState<{ items: any[]; loading: boolean }>({ items: [], loading: false });
  const { data: plans, isLoading } = useMealPlans();
  const { data: activePlan, plans: sortedPlans } = useActiveMealPlan();
  const generateMutation = useGenerateMealPlan();
  const activateMutation = useActivateMealPlan();
  const toggleMealMutation = useToggleMealCompletion();
  const updateDaysMutation = useUpdateMealPlanDays();
  const updateStatusMutation = useUpdateMealPlanStatus();
  const deletePlanMutation = useDeleteMealPlan();
  const dayScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollDays = (delta: number) => {
    if (dayScrollRef.current) {
      dayScrollRef.current.scrollBy({ left: delta, behavior: "smooth" });
    }
  };
  const queryClient = useQueryClient();
  const highlightMealDates = React.useMemo(() => {
    return (plans || [])
      .filter((p: any) => p.status === 'active')
      .flatMap((p: any) =>
        (p.days || []).map((day: any, idx: number) =>
          day?.date ? day.date : p.startDate ? new Date(new Date(p.startDate).getTime() + idx * 86400000) : null
        )
      )
      .filter(Boolean);
  }, [plans]);

  const handleGenerate = async (formData: GeneratePlanFormData) => {
    const goalsMap: Record<string, string> = {
      "lose-weight": "lose_weight",
      maintain: "maintain_weight",
      "gain-muscle": "build_muscle",
      "improve-health": "improve_health",
      "increase-energy": "increase_energy",
    };

    try {
      await generateMutation.mutateAsync({
        preferences: {
          dietType: formData.dietType,
          goals: goalsMap[formData.goals] || formData.goals,
          activityLevel: formData.activityLevel,
          quickMeal: formData.quickMeal,
          additionalNotes: formData.additionalNotes,
        },
        duration: formData.duration,
        startDate: formData.startDate,
      });
      setShowModal(false);
      toast.success('New meal plan generated!');
    } catch (error) {
      console.error('Generate error:', error);
      toast.error('Failed to generate meal plan');
    }
  };

  const plansList = Array.isArray(sortedPlans) ? sortedPlans : [];
  const totalPlans = plansList.length;
  const mealCount = getMealCountFromPlan(activePlan);

  const getPlanById = (id: string) => plansList.find(p => getPlanId(p) === id);
  const activeMealData = selectedMeal
    ? getPlanById(selectedMeal.planId)?.days?.[selectedMeal.dayIndex]?.meals?.[selectedMeal.mealIndex]
    : null;
  const selectedPlan = selectedDay ? getPlanById(selectedDay.planId) : undefined;
  const getPlanDates = React.useCallback((plan: any) => {
    const base = normalizeDate(plan?.startDate);
    const dates: Date[] = [];
    (plan?.days || []).forEach((d: any, idx: number) => {
      let dateStr = d?.date ? normalizeDate(d.date) : "";
      if (!dateStr && base) {
        const b = new Date(base);
        if (!Number.isNaN(b.getTime())) {
          const copy = new Date(b);
          copy.setDate(copy.getDate() + idx);
          dateStr = normalizeDate(copy.toISOString());
        }
      }
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!Number.isNaN(parsed.getTime())) dates.push(parsed);
      }
    });
    return dates;
  }, [normalizeDate]);
  const allActivePlanDates = React.useMemo(() => {
    return plansList
      .filter((p) => p.status === "active")
      .flatMap((p) => getPlanDates(p));
  }, [plansList, getPlanDates]);
  const bookedDates = React.useMemo(() => {
    const activePlans = plansList.filter((p) => p.status === "active");
    const dateSet = new Set<string>();

    activePlans.forEach((plan) => {
      const base = plan.startDate ? normalizeDate(plan.startDate) : "";
      (plan.days || []).forEach((d, idx) => {
        let dateStr = d?.date ? normalizeDate(d.date) : "";
        if (!dateStr && base) {
          const baseDate = new Date(base);
          if (!Number.isNaN(baseDate.getTime())) {
            const clone = new Date(baseDate);
            clone.setDate(clone.getDate() + idx);
            dateStr = normalizeDate(clone.toISOString());
          }
        }
        if (dateStr) dateSet.add(dateStr);
      });
    });

    return Array.from(dateSet)
      .map((str) => {
        const parsed = new Date(str);
        return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
      })
      .filter(Boolean) as Date[];
  }, [plansList]);

  function normalizeDate(value?: string) {
    if (!value) return "";
    // If already a plain date string, keep as-is to avoid TZ shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    // Convert to local date part to avoid off-by-one in UI
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  useEffect(() => {
    if (selectedPlan?.startDate) {
      setStartDateDraft(normalizeDate(selectedPlan.startDate));
    } else {
      setStartDateDraft("");
    }
  }, [selectedPlan]);

  const firstNumber = (...vals: any[]): number | string => {
    for (const val of vals) {
      const num = Number(val);
      if (!Number.isNaN(num) && Number.isFinite(num)) {
        return num;
      }
    }
    return "—";
  };

  const normalizeMealDetails = (meal: any) => {
    const recipe = meal?.recipes?.[0] || {};
    const instructionsRaw = (recipe as any).instructions || recipe.description || "";
    const instructions = Array.isArray(instructionsRaw)
      ? instructionsRaw.map((step: any) =>
          typeof step === "string"
            ? step
            : typeof step === "object" && step?.text
              ? step.text
              : JSON.stringify(step)
        )
      : typeof instructionsRaw === "string" && instructionsRaw.trim()
        ? instructionsRaw
            .split(/\r?\n+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const ingredientsRaw =
      (recipe as any).ingredients ||
      (recipe as any).ingredientLines ||
      (recipe as any).ingredients_list ||
      (recipe as any).ingredientsList ||
      [];
    const ingredients = Array.isArray(ingredientsRaw)
      ? ingredientsRaw.map((ing: any) => {
          if (typeof ing === "string") return ing;
          if (typeof ing === "object") {
            const parts = [ing.name, ing.amount, ing.unit].filter(Boolean).join(" ");
            return parts || JSON.stringify(ing);
          }
          return String(ing);
        })
      : typeof ingredientsRaw === "string"
        ? [ingredientsRaw]
        : [];
    const time =
      meal?.scheduledTime ||
      (recipe as any).total_time_minutes ||
      (recipe as any).total_time_min ||
      (recipe as any).cook_time ||
      "--:--";
    const macrosSrc =
      meal?.macros ||
      recipe?.macros ||
      (recipe?.nutrition as any)?.macros ||
      recipe?.nutrition ||
      recipe?.totalNutrition ||
      {};
    const macros = {
      protein: firstNumber(
        macrosSrc.protein,
        macrosSrc.protein_g,
        macrosSrc.proteinGrams,
        macrosSrc.protein_grams
      ),
      carbs: firstNumber(
        macrosSrc.carbs,
        macrosSrc.carbs_g,
        macrosSrc.carbohydrates,
        macrosSrc.carbs_grams,
        macrosSrc.totalNutrition?.carbs
      ),
      fats: firstNumber(
        macrosSrc.fat,
        macrosSrc.fats,
        macrosSrc.fat_g,
        macrosSrc.fat_grams,
        macrosSrc.totalNutrition?.fat
      ),
      fiber: firstNumber(
        macrosSrc.fiber,
        macrosSrc.fiber_g,
        macrosSrc.fiber_grams
      ),
      sugar: firstNumber(
        macrosSrc.sugar,
        macrosSrc.sugar_g,
        macrosSrc.sugar_grams
      ),
      calories: firstNumber(
        meal?.calories,
        recipe?.calories,
        recipe?.nutrition?.calories,
        macrosSrc.calories
      ),
    };
    return { recipe, instructions, ingredients, time, macros };
  };

  const swapKeyFor = (planId: string, dayIndex: number, mealIndex: number) => `${planId}-${dayIndex}-${mealIndex}`;

  const lastDayScrollTs = useRef<number>(0);
  const changeDay = (planId: string, step: number) => {
    const plan = getPlanById(planId);
    if (!plan?.days?.length || !step) return;
    const current = selectedDay?.planId === planId ? selectedDay.dayIndex : 0;
    const next = Math.min(plan.days.length - 1, Math.max(0, current + step));
    if (next !== current) {
      setSelectedDay({ planId, dayIndex: next });
      setSelectedMeal(null);
    }
  };

  const handleDayWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!selectedDay) return;
    const now = Date.now();
    if (now - lastDayScrollTs.current < 400) return;
    const deltaX = e.deltaX;
    const deltaY = e.deltaY;
    // Use dominant horizontal intent to flip days; prevent browser back/forward
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX > absY + 10 && absX > 24) {
      if (e.cancelable) e.preventDefault();
      lastDayScrollTs.current = now;
      changeDay(selectedDay.planId, deltaX > 0 ? 1 : -1);
    }
  };

  const changeMeal = (planId: string, dayIndex: number, step: number) => {
    const meals = getPlanById(planId)?.days?.[dayIndex]?.meals;
    if (!meals?.length || !step) return;
    const current =
      selectedMeal?.planId === planId && selectedMeal.dayIndex === dayIndex
        ? selectedMeal.mealIndex
        : 0;
    const next = Math.min(meals.length - 1, Math.max(0, current + step));
    if (next !== current) setSelectedMeal({ planId, dayIndex, mealIndex: next });
  };

  const handleSwapOpen = async (planId: string, dayIndex: number, mealIndex: number) => {
    if (!planId) {
      toast.error("Swap requires a saved meal plan.");
      return;
    }
    const key = swapKeyFor(planId, dayIndex, mealIndex);
    setSwapState({ key, options: [], loading: true, applying: false });
    try {
      const options = await getMealAlternatives({ planId, dayIndex, mealIndex, limit: 3 });
      const limited = Array.isArray(options) ? options.slice(0, 3) : [];
      setSwapState({ key, options: limited, loading: false, applying: false });
      if (!options.length) toast("No alternatives found right now.");
      if (!favorites.items.length) {
        setFavorites({ items: [], loading: true });
        try {
          const favs = await getFavoriteRecipes();
          setFavorites({ items: favs, loading: false });
        } catch (favErr) {
          console.error("Error loading favorites", favErr);
          setFavorites({ items: [], loading: false });
        }
      }
    } catch (err) {
      console.error("Error fetching alternatives", err);
      toast.error("Failed to load alternatives");
      setSwapState({ key: null, options: [], loading: false, applying: false });
    }
  };

  const handleApplyFavorite = async (planId: string, dayIndex: number, mealIndex: number, fav: any) => {
    const recipePayload = fav?.planRecipe || fav?.recipe;
    if (!recipePayload) {
      toast.error("Favorite is missing recipe data");
      return;
    }
    await handleApplyAlternative(planId, dayIndex, mealIndex, undefined, recipePayload);
  };

  const handleApplyAlternative = async (planId: string, dayIndex: number, mealIndex: number, recipeId?: string, recipe?: any) => {
    if (!planId) return;
    if (!recipeId && !recipe) return;
    setSwapState(prev => ({ ...prev, applying: true }));
    try {
      await applyMealAlternative({ planId, dayIndex, mealIndex, recipeId, recipe });
      toast.success("Meal swapped");
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] });
      setSwapState({ key: null, options: [], loading: false, applying: false });
    } catch (err) {
      console.error("Error applying swap", err);
      toast.error("Failed to swap meal");
      setSwapState(prev => ({ ...prev, applying: false }));
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
            <div className="glass-card p-5 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {isLoading ? "—" : totalPlans}
                </p>
                <p className="text-sm text-muted-foreground">Total Plans</p>
              </div>
            </div>
            <div className="glass-card p-5 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <ChefHat className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {isLoading ? "—" : mealCount}
                </p>
                <p className="text-sm text-muted-foreground">Meals in Active Plan</p>
              </div>
            </div>
            <div className="glass-card p-5 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground truncate">
                  {isLoading ? "—" : activePlan?.title || "No active plan"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {activePlan?.status === 'active' ? 'Active' : activePlan?.status || '—'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Empty State or Plans Info */}
          {!isLoading && !activePlan && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-8 text-center mb-12"
            >
              <ChefHat className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                No meal plan yet. Generate one to get started!
              </p>
            </motion.div>
          )}

          {/* Plans list with expand/collapse */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="space-y-4 mb-24"
          >
            {plansList.map((plan) => {
              const planId = getPlanId(plan);
              const planDates = getPlanDates(plan);
              const planDatesSet = new Set(planDates.map((d) => d.toDateString()));
              const otherActiveDates = allActivePlanDates.filter(
                (d) => !planDatesSet.has(d.toDateString())
              );
              return (
                <div key={planId} className="glass-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 cursor-pointer" onClick={() => {
                      setExpandedPlanId(planId);
                      setSelectedDay({ planId, dayIndex: 0 });
                      setSelectedMeal(null);
                    }}>
                      <p className="text-lg font-semibold text-foreground">{plan.title}</p>
                      {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                          {plan.status || "draft"}
                        </span>
                        <span className="px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs">
                          {plan.days?.length || 0} days
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Start date</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="rounded-full bg-background">
                            <Calendar className="h-4 w-4 mr-2" />
                            {plan.startDate ? format(new Date(normalizeDate(plan.startDate)), "PP") : "Set start date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-3 w-auto" align="start">
                          <CalendarPicker
                            mode="single"
                            selected={plan.startDate ? new Date(normalizeDate(plan.startDate)) : undefined}
                            onSelect={(date) => {
                              if (!date) return;
                              const newDate = format(date, "yyyy-MM-dd");
                              updateDaysMutation.mutate(
                                { planId, days: plan.days || [], startDate: newDate },
                                {
                                  onSuccess: () => toast.success("Plan start date updated"),
                                  onError: () => toast.error("Failed to update start date"),
                                }
                              );
                            }}
                            modifiers={{ currentPlan: planDates, otherActive: otherActiveDates }}
                            modifiersClassNames={{
                              currentPlan: "bg-orange-200 text-orange-800 font-semibold hover:bg-orange-300",
                              otherActive: "bg-emerald-200 text-emerald-800 font-semibold hover:bg-emerald-300",
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            updateStatusMutation.mutate({ planId, status: plan.status === "active" ? "draft" : "active" })
                          }
                          disabled={updateStatusMutation.isPending}
                          className="rounded-full"
                        >
                          {plan.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          disabled={deletePlanMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePlanMutation.mutate(planId, {
                              onSuccess: () => toast.success("Meal plan deleted"),
                              onError: () => toast.error("Failed to delete meal plan"),
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                </div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Generate Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40"
      >
        <Button
          variant="primary"
          size="lg"
          className="rounded-full px-8 py-6 text-base shadow-lg glow-primary"
          onClick={() => setShowModal(true)}
        >
          <Sparkles className="h-5 w-5 mr-2" />
          Generate AI Plan
        </Button>
      </motion.div>

      {/* Generate Plan Modal */}
      <GeneratePlanModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleGenerate}
        isLoading={generateMutation.isPending}
      />

      <DayDetailDialog
        open={!!selectedDay}
        planId={selectedDay?.planId || ""}
        days={selectedDay ? getPlanById(selectedDay.planId)?.days || [] : []}
        selectedDayIndex={selectedDay?.dayIndex || 0}
        startDate={
          selectedDay
            ? normalizeDate(getPlanById(selectedDay.planId)?.startDate || "")
            : undefined
        }
        onUpdateStartDate={(newDate) => {
          if (!selectedDay) return;
          const plan = getPlanById(selectedDay.planId);
          if (!plan) return;
          updateDaysMutation.mutate(
            {
              planId: selectedDay.planId,
              days: plan.days || [],
              startDate: newDate,
            },
            {
              onSuccess: () => toast.success("Plan start date updated"),
              onError: () => toast.error("Failed to update start date"),
            }
          );
        }}
        highlightDates={highlightMealDates}
        onClose={() => {
          setSelectedDay(null);
          setSelectedMeal(null);
        }}
        onSelectDay={(idx) => {
          if (!selectedDay) return;
          setSelectedDay({ planId: selectedDay.planId, dayIndex: idx });
          setSelectedMeal(null);
        }}
        onSelectMeal={(dayIdx, mealIdx) => {
          if (!selectedDay) return;
          setSelectedMeal({ planId: selectedDay.planId, dayIndex: dayIdx, mealIndex: mealIdx });
        }}
        onChangeDay={(step) => {
          if (selectedDay) changeDay(selectedDay.planId, step);
        }}
        onWheel={handleDayWheel}
        swapState={swapState}
        swapKeyFor={swapKeyFor}
        onSwapOpen={(dayIdx, mealIdx) => selectedDay && handleSwapOpen(selectedDay.planId, dayIdx, mealIdx)}
        onApplyAlternative={(dayIdx, mealIdx, recipeId) =>
          selectedDay && handleApplyAlternative(selectedDay.planId, dayIdx, mealIdx, recipeId)
        }
        onToggleMeal={(dayIdx, mealIdx, isCompleted) => {
          if (!selectedDay) return;
          toggleMealMutation.mutate({
            planId: selectedDay.planId,
            dayIndex: dayIdx,
            mealIndex: mealIdx,
            isCompleted,
          });
        }}
        onDeleteMeal={(dayIdx, mealIdx) => {
          if (!selectedDay) return;
          const plan = getPlanById(selectedDay.planId);
          if (!plan?.days) return;
          const newDays = plan.days.map((d, dIdx) => {
            if (dIdx !== dayIdx) return d;
            return {
              ...d,
              meals: (d.meals || []).filter((_, mmIdx) => mmIdx !== mealIdx),
            };
          });
          updateDaysMutation.mutate({ planId: selectedDay.planId, days: newDays });
          setSelectedMeal(null);
        }}
      />

      <MealDetailDialog
        open={!!selectedMeal && !!activeMealData}
        onOpenChange={(open) => {
          if (!open) setSelectedMeal(null);
        }}
        meal={activeMealData}
        normalizeMealDetails={normalizeMealDetails}
        isCompleted={activeMealData?.isCompleted}
        onSwap={() => {
          if (selectedMeal) handleSwapOpen(selectedMeal.planId, selectedMeal.dayIndex, selectedMeal.mealIndex);
        }}
        onToggleComplete={() => {
          if (!selectedMeal || !activeMealData) return;
          toggleMealMutation.mutate({
            planId: selectedMeal.planId,
            dayIndex: selectedMeal.dayIndex,
            mealIndex: selectedMeal.mealIndex,
            isCompleted: !activeMealData.isCompleted,
          });
        }}
        onDelete={() => {
          if (!selectedMeal) return;
          const plan = getPlanById(selectedMeal.planId);
          if (!plan?.days) return;
          const newDays = plan.days.map((d, dIdx) => {
            if (dIdx !== selectedMeal.dayIndex) return d;
            return {
              ...d,
              meals: (d.meals || []).filter((_, mmIdx) => mmIdx !== selectedMeal.mealIndex),
            };
          });
          updateDaysMutation.mutate({ planId: selectedMeal.planId, days: newDays });
          setSelectedMeal(null);
        }}
        onNext={() => {
          if (selectedMeal) changeMeal(selectedMeal.planId, selectedMeal.dayIndex, 1);
        }}
        onPrev={() => {
          if (selectedMeal) changeMeal(selectedMeal.planId, selectedMeal.dayIndex, -1);
        }}
      />
    </div>
  );
}
