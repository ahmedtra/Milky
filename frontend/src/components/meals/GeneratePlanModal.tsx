import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useMealPlans } from "@/hooks/use-meal-plans";
import { cn } from "@/lib/utils";

interface GeneratePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: GeneratePlanFormData) => void;
  isLoading: boolean;
}

export interface GeneratePlanFormData {
  dietType: string;
  activityLevel: string;
  goals: string;
  difficulty: string;
  duration: number;
  quickMeal: boolean;
  includeIngredients: string;
  allergies: string;
  dislikedFoods: string;
  mealTimes: {
    breakfast: string;
    lunch: string;
    dinner: string;
    snack: string;
  };
  enabledMeals: {
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
    snack: boolean;
  };
  additionalNotes: string;
  startDate: string;
}

type IngredientMood = "use" | "dislike" | "allergy" | null;

const dietTypes = [
  { value: "balanced", label: "Balanced" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "keto", label: "Keto" },
  { value: "paleo", label: "Paleo" },
  { value: "low_carb", label: "Low Carb" },
  { value: "high_protein", label: "High Protein" },
];

const activityLevels = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light Activity" },
  { value: "moderate", label: "Moderate Activity" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very Active" },
];

const goals = [
  { value: "lose_weight", label: "Lose Weight" },
  { value: "gain_weight", label: "Gain Weight" },
  { value: "maintain_weight", label: "Maintain Weight" },
  { value: "build_muscle", label: "Build Muscle" },
  { value: "improve_health", label: "Improve Health" },
];

const durations = [
  { value: 1, label: "1 Day" },
  { value: 2, label: "2 Days" },
  { value: 3, label: "3 Days" },
  { value: 5, label: "5 Days" },
  { value: 7, label: "7 Days" },
  { value: 14, label: "14 Days" },
];

const ingredientSections: Array<{
  key: string;
  title: string;
  color: string;
  items: Array<{ name: string }>;
}> = [
  {
    key: "produce",
    title: "Produce",
    color: "emerald",
    items: [
      { name: "Apple" },
      { name: "Avocado" },
      { name: "Banana" },
      { name: "Basil" },
      { name: "Bell Pepper" },
      { name: "Blueberry" },
      { name: "Broccoli" },
      { name: "Cabbage" },
      { name: "Carrot" },
      { name: "Cauliflower" },
      { name: "Celery" },
      { name: "Cilantro" },
      { name: "Cucumber" },
      { name: "Garlic" },
      { name: "Ginger" },
      { name: "Kale" },
      { name: "Lettuce" },
      { name: "Onion" },
      { name: "Orange" },
      { name: "Potato" },
      { name: "Spinach" },
      { name: "Strawberry" },
      { name: "Sweet Potato" },
      { name: "Tomato" },
    ],
  },
  {
    key: "protein",
    title: "Proteins & Dairy",
    color: "amber",
    items: [
      { name: "Chicken Breast" },
      { name: "Salmon" },
      { name: "Shrimp" },
      { name: "Tofu" },
      { name: "Eggs" },
      { name: "Greek Yogurt" },
      { name: "Cheddar" },
      { name: "Feta" },
      { name: "Black Beans" },
    ],
  },
  {
    key: "pantry",
    title: "Pantry",
    color: "cyan",
    items: [
      { name: "Flour" },
      { name: "Rice" },
      { name: "Quinoa" },
      { name: "Sugar" },
      { name: "Olive Oil" },
      { name: "Honey" },
      { name: "Pasta" },
    ],
  },
];

export function GeneratePlanModal({ isOpen, onClose, onSubmit, isLoading }: GeneratePlanModalProps) {
  const parseLocalDate = (value?: string) => {
    if (!value) return undefined;
    const parts = value.split('-').map(Number);
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const dt = new Date(y, m - 1, d);
      return Number.isNaN(dt.getTime()) ? undefined : dt;
    }
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? undefined : dt;
  };
  const [formData, setFormData] = useState<GeneratePlanFormData>({
    dietType: "balanced",
    activityLevel: "moderate",
    goals: "maintain_weight",
    difficulty: "any",
    duration: 5,
    quickMeal: false,
    includeIngredients: "",
    allergies: "",
    dislikedFoods: "",
    mealTimes: {
      breakfast: "08:00",
      lunch: "13:00",
      dinner: "19:00",
      snack: "15:30",
    },
    enabledMeals: {
      breakfast: true,
      lunch: true,
      dinner: true,
      snack: false,
    },
    additionalNotes: "",
    startDate: new Date().toISOString().split("T")[0],
  });
  const { data: plans } = useMealPlans();
  const [ingredientStatus, setIngredientStatus] = useState<Record<string, IngredientMood>>({});
  const [applyIngredientGuidance, setApplyIngredientGuidance] = useState(true);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [showPaletteMobile, setShowPaletteMobile] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const normalizeDate = (value?: string) => {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const bookedDates = useMemo(() => {
    const list = Array.isArray(plans) ? plans : [];
    const active = list.filter((p) => p.status === "active");
    const set = new Set<string>();
    active.forEach((plan) => {
      const base = plan.startDate ? normalizeDate(plan.startDate as any) : "";
      (plan.days || []).forEach((d: any, idx: number) => {
        let dateStr = d?.date ? normalizeDate(d.date as any) : "";
        if (!dateStr && base) {
          const baseDate = new Date(base);
          if (!Number.isNaN(baseDate.getTime())) {
            const t = new Date(baseDate);
            t.setDate(t.getDate() + idx);
            dateStr = normalizeDate(t.toISOString());
          }
        }
        if (dateStr) set.add(dateStr);
      });
    });
    return Array.from(set)
      .map((str) => {
        const d = new Date(str);
        return Number.isNaN(d.getTime()) ? null : d;
      })
      .filter(Boolean) as Date[];
  }, [plans]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selections = Object.entries(ingredientStatus).reduce(
      (acc, [name, mood]) => {
        if (mood === "allergy") acc.allergies.push(name);
        if (mood === "dislike") acc.disliked.push(name);
        if (mood === "use") acc.use.push(name);
        return acc;
      },
      { allergies: [] as string[], disliked: [] as string[], use: [] as string[] }
    );

    const mergeUnique = (text: string, extra: string[]) => {
      const base = (text || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const set = new Set<string>(base.map((s) => s.toLowerCase()));
      extra.forEach((s) => {
        if (!set.has(s.toLowerCase())) base.push(s);
      });
      return base.join(", ");
    };

    const payload = applyIngredientGuidance
      ? {
          ...formData,
          allergies: mergeUnique(formData.allergies, selections.allergies),
          dislikedFoods: mergeUnique(formData.dislikedFoods, selections.disliked),
          includeIngredients: mergeUnique(formData.includeIngredients, selections.use),
        }
      : formData;

    onSubmit(payload);
  };

  const cycleMood = (name: string) => {
    setIngredientStatus((prev) => {
      const current = prev[name] || null;
      const next: IngredientMood =
        current === null ? "use" : current === "use" ? "dislike" : current === "dislike" ? "allergy" : null;
      return { ...prev, [name]: next };
    });
  };

  const moodStyles: Record<Exclude<IngredientMood, null>, string> = {
    use: "border-emerald-400 ring-2 ring-emerald-200/70 shadow-[0_10px_30px_-18px_rgba(16,185,129,0.8)]",
    dislike: "border-amber-400 ring-2 ring-amber-200/70 shadow-[0_10px_30px_-18px_rgba(245,158,11,0.8)]",
    allergy: "border-rose-400 ring-2 ring-rose-200/70 shadow-[0_10px_30px_-18px_rgba(244,63,94,0.8)]",
  };

  const legend = [
    { label: "Use more", color: "bg-emerald-500" },
    { label: "Dislike", color: "bg-amber-500" },
    { label: "Allergy", color: "bg-rose-500" },
  ];

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const iconFor = (name: string) =>
    `${import.meta.env.BASE_URL || "/"}ingredient-icons/${slugify(name)}.png`;

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 1024);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const filteredSections = useMemo(() => {
    const term = paletteSearch.trim().toLowerCase();
    if (!term) return ingredientSections;
    return ingredientSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.name.toLowerCase().includes(term)),
      }))
      .filter((section) => section.items.length > 0);
  }, [paletteSearch]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
          >
            <div className="glass-card-elevated p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">Generate Meal Plan</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {isMobile ? (
                <>
                  <div className="h-[calc(90vh-96px)] flex flex-col gap-3">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowPaletteMobile(true)}
                      >
                        Open ingredients
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-1 min-w-0">
                      <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Diet Type */}
                        <div className="space-y-2">
                          <Label htmlFor="dietType">Diet Type</Label>
                          <Select
                            value={formData.dietType}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, dietType: value }))}
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="Select diet type" />
                            </SelectTrigger>
                            <SelectContent>
                              {dietTypes.map(diet => (
                                <SelectItem key={diet.value} value={diet.value}>
                                  {diet.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Goals */}
                        <div className="space-y-2">
                          <Label htmlFor="goals">Goals</Label>
                          <Select
                            value={formData.goals}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, goals: value }))}
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="Select your goal" />
                            </SelectTrigger>
                            <SelectContent>
                              {goals.map(goal => (
                                <SelectItem key={goal.value} value={goal.value}>
                                  {goal.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Difficulty */}
                        <div className="space-y-2">
                          <Label htmlFor="difficulty">Difficulty</Label>
                          <Select
                            value={formData.difficulty}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value }))}
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="Any difficulty" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="easy">Easy</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="hard">Hard</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Quick Meal */}
                        <div className="flex items-center justify-between py-2">
                          <div>
                            <Label htmlFor="quickMeal">Prefer quick recipes</Label>
                            <p className="text-sm text-muted-foreground">Aim for meals under ~30 minutes</p>
                          </div>
                          <Switch
                            id="quickMeal"
                            checked={formData.quickMeal}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, quickMeal: checked }))}
                          />
                        </div>

                        {/* Activity Level */}
                        <div className="space-y-2">
                          <Label htmlFor="activityLevel">Activity Level</Label>
                          <Select
                            value={formData.activityLevel}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, activityLevel: value }))}
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="Select activity level" />
                            </SelectTrigger>
                            <SelectContent>
                              {activityLevels.map(level => (
                                <SelectItem key={level.value} value={level.value}>
                                  {level.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Duration */}
                        <div className="space-y-2">
                          <Label htmlFor="duration">Plan Duration</Label>
                          <Select
                            value={formData.duration.toString()}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, duration: parseInt(value) }))}
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                            <SelectContent>
                              {durations.map(dur => (
                                <SelectItem key={dur.value} value={dur.value.toString()}>
                                  {dur.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Allergies */}
                        <div className="space-y-2">
                          <Label htmlFor="allergies">Allergies (manual)</Label>
                          <Input
                            id="allergies"
                            placeholder="e.g., nuts, shellfish, dairy"
                            value={formData.allergies}
                            onChange={(e) => setFormData(prev => ({ ...prev, allergies: e.target.value }))}
                            className="rounded-xl"
                          />
                          <p className="text-sm text-muted-foreground">Comma-separated list to avoid problem ingredients</p>
                        </div>

                        {/* Use Ingredients */}
                        <div className="space-y-2">
                          <Label htmlFor="includeIngredients">Use These Ingredients (manual)</Label>
                          <Input
                            id="includeIngredients"
                            placeholder="e.g., chicken breast, broccoli, rice"
                            value={formData.includeIngredients}
                            onChange={(e) => setFormData(prev => ({ ...prev, includeIngredients: e.target.value }))}
                            className="rounded-xl"
                          />
                          <p className="text-sm text-muted-foreground">Comma-separated ingredients to prioritize</p>
                        </div>

                        {/* Disliked Foods */}
                        <div className="space-y-2">
                          <Label htmlFor="dislikedFoods">Disliked Foods (manual)</Label>
                          <Input
                            id="dislikedFoods"
                            placeholder="e.g., mushrooms, spicy food"
                            value={formData.dislikedFoods}
                            onChange={(e) => setFormData(prev => ({ ...prev, dislikedFoods: e.target.value }))}
                            className="rounded-xl"
                          />
                          <p className="text-sm text-muted-foreground">Comma-separated items to keep out of plans</p>
                        </div>

                        {/* Meal Times */}
                        <div className="space-y-2">
                          <Label>Meal Times</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { key: "breakfast", label: "Breakfast" },
                              { key: "lunch", label: "Lunch" },
                              { key: "dinner", label: "Dinner" },
                              { key: "snack", label: "Snack" },
                            ].map((meal) => {
                              const enabled = formData.enabledMeals[meal.key as keyof typeof formData.enabledMeals];
                              return (
                                <div key={meal.key} className="space-y-1 rounded-lg border border-border/60 p-2 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <Label htmlFor={meal.key} className="text-xs font-semibold text-foreground">{meal.label}</Label>
                                    <Switch
                                      id={`${meal.key}-toggle`}
                                      checked={enabled}
                                      onCheckedChange={(checked) =>
                                        setFormData((prev) => ({
                                          ...prev,
                                          enabledMeals: { ...prev.enabledMeals, [meal.key]: checked },
                                        }))
                                      }
                                    />
                                  </div>
                                  <Input
                                    id={meal.key}
                                    type="time"
                                    value={formData.mealTimes[meal.key as keyof typeof formData.mealTimes]}
                                    onChange={(e) =>
                                      setFormData((prev) => ({
                                        ...prev,
                                        mealTimes: { ...prev.mealTimes, [meal.key]: e.target.value },
                                      }))
                                    }
                                    className="rounded-xl text-[11px]"
                                    disabled={!enabled}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Additional Notes */}
                        <div className="space-y-2">
                          <Label htmlFor="additionalNotes">Additional Notes</Label>
                          <Textarea
                            id="additionalNotes"
                            placeholder="Any allergies, preferences, or special requests..."
                            value={formData.additionalNotes}
                            onChange={(e) => setFormData(prev => ({ ...prev, additionalNotes: e.target.value }))}
                            className="rounded-xl min-h-[80px] resize-none"
                          />
                        </div>

                        {/* Start Date with calendar popover */}
                        <div className="space-y-2">
                          <Label htmlFor="startDate">Start Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-start rounded-xl bg-background text-left font-normal"
                              >
                                {formData.startDate
                                  ? format(parseLocalDate(formData.startDate) as Date, "PP")
                                  : "Select date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-3 w-auto" align="start">
                              <CalendarPicker
                                mode="single"
                                selected={parseLocalDate(formData.startDate)}
                                onSelect={(date) => {
                                  if (date) {
                                    const iso = format(date, "yyyy-MM-dd");
                                    setFormData((prev) => ({ ...prev, startDate: iso }));
                                  }
                                }}
                                modifiers={{ booked: bookedDates }}
                                modifiersClassNames={{
                                  booked: "bg-primary/20 text-primary font-semibold hover:bg-primary/30",
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>

                        {/* Submit Button */}
                        <Button
                          type="submit"
                          variant="primary"
                          className="w-full rounded-xl"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Generate Plan
                            </>
                          )}
                        </Button>
                      </form>
                    </div>
                  </div>

                  {showPaletteMobile && (
                    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm flex flex-col">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <p className="text-sm font-semibold text-foreground">Ingredient palette</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setShowPaletteMobile(false)}>
                          Close
                        </Button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div className="relative w-full">
                          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                          <Input
                            value={paletteSearch}
                            onChange={(e) => setPaletteSearch(e.target.value)}
                            placeholder="Search ingredients"
                            className="pl-9 rounded-xl"
                          />
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {legend.map((item) => (
                            <span key={item.label} className="flex items-center gap-1">
                              <span className={cn("h-3 w-3 rounded-full", item.color)} />
                              {item.label}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Apply these choices to plan generation</Label>
                          <Switch
                            checked={applyIngredientGuidance}
                            onCheckedChange={setApplyIngredientGuidance}
                          />
                        </div>
                        <div className="space-y-6">
                          {filteredSections.map((section) => (
                            <div key={section.key} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-foreground">{section.title}</p>
                                <p className="text-xs text-muted-foreground">{section.items.length} staples</p>
                              </div>
                              <div className="grid grid-cols-2 gap-3 w-full min-w-0">
                                {section.items.map((item) => {
                                  const mood = ingredientStatus[item.name] || null;
                                  const moodClass = mood ? moodStyles[mood] : "border-transparent";
                                  return (
                                    <button
                                      key={item.name}
                                      type="button"
                                      onClick={() => cycleMood(item.name)}
                                      className={cn(
                                        "group relative rounded-2xl overflow-hidden border bg-background text-left shadow-sm hover:shadow-md transition w-full",
                                        moodClass
                                      )}
                                    >
                                      <img
                                        src={iconFor(item.name)}
                                        alt={item.name}
                                        className="h-14 w-14 object-cover mx-auto mt-2 rounded-full"
                                        loading="lazy"
                                      />
                                      <div className="px-2 pb-2 pt-1.5 text-center">
                                        <p className="text-xs font-semibold text-foreground truncate">{item.name}</p>
                                        <p className="text-[10px] text-muted-foreground">Tap to cycle</p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6 h-[calc(90vh-96px)]">
                  <form
                    onSubmit={handleSubmit}
                    className="space-y-4 overflow-y-auto pr-1 min-w-0 lg:pr-3"
                  >
                    {/* Desktop form retains existing content */}
                    {/* Diet Type */}
                    <div className="space-y-2">
                      <Label htmlFor="dietType">Diet Type</Label>
                      <Select
                        value={formData.dietType}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, dietType: value }))}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select diet type" />
                        </SelectTrigger>
                        <SelectContent>
                          {dietTypes.map(diet => (
                            <SelectItem key={diet.value} value={diet.value}>
                              {diet.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Goals */}
                    <div className="space-y-2">
                      <Label htmlFor="goals">Goals</Label>
                      <Select
                        value={formData.goals}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, goals: value }))}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select your goal" />
                        </SelectTrigger>
                        <SelectContent>
                          {goals.map(goal => (
                            <SelectItem key={goal.value} value={goal.value}>
                              {goal.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Difficulty */}
                    <div className="space-y-2">
                      <Label htmlFor="difficulty">Difficulty</Label>
                      <Select
                        value={formData.difficulty}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value }))}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Any difficulty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Quick Meal */}
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <Label htmlFor="quickMeal">Prefer quick recipes</Label>
                        <p className="text-sm text-muted-foreground">Aim for meals under ~30 minutes</p>
                      </div>
                      <Switch
                        id="quickMeal"
                        checked={formData.quickMeal}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, quickMeal: checked }))}
                      />
                    </div>

                    {/* Activity Level */}
                    <div className="space-y-2">
                      <Label htmlFor="activityLevel">Activity Level</Label>
                      <Select
                        value={formData.activityLevel}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, activityLevel: value }))}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select activity level" />
                        </SelectTrigger>
                        <SelectContent>
                          {activityLevels.map(level => (
                            <SelectItem key={level.value} value={level.value}>
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                      <Label htmlFor="duration">Plan Duration</Label>
                      <Select
                        value={formData.duration.toString()}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, duration: parseInt(value) }))}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          {durations.map(dur => (
                            <SelectItem key={dur.value} value={dur.value.toString()}>
                              {dur.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Allergies */}
                    <div className="space-y-2">
                      <Label htmlFor="allergies">Allergies (manual)</Label>
                      <Input
                        id="allergies"
                        placeholder="e.g., nuts, shellfish, dairy"
                        value={formData.allergies}
                        onChange={(e) => setFormData(prev => ({ ...prev, allergies: e.target.value }))}
                        className="rounded-xl"
                      />
                      <p className="text-sm text-muted-foreground">Comma-separated list to avoid problem ingredients</p>
                    </div>

                    {/* Use Ingredients */}
                    <div className="space-y-2">
                      <Label htmlFor="includeIngredients">Use These Ingredients (manual)</Label>
                      <Input
                        id="includeIngredients"
                        placeholder="e.g., chicken breast, broccoli, rice"
                        value={formData.includeIngredients}
                        onChange={(e) => setFormData(prev => ({ ...prev, includeIngredients: e.target.value }))}
                        className="rounded-xl"
                      />
                      <p className="text-sm text-muted-foreground">Comma-separated ingredients to prioritize</p>
                    </div>

                    {/* Disliked Foods */}
                    <div className="space-y-2">
                      <Label htmlFor="dislikedFoods">Disliked Foods (manual)</Label>
                      <Input
                        id="dislikedFoods"
                        placeholder="e.g., mushrooms, spicy food"
                        value={formData.dislikedFoods}
                        onChange={(e) => setFormData(prev => ({ ...prev, dislikedFoods: e.target.value }))}
                        className="rounded-xl"
                      />
                      <p className="text-sm text-muted-foreground">Comma-separated items to keep out of plans</p>
                    </div>

                    {/* Meal Times */}
                    <div className="space-y-2">
                      <Label>Meal Times</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: "breakfast", label: "Breakfast" },
                          { key: "lunch", label: "Lunch" },
                          { key: "dinner", label: "Dinner" },
                          { key: "snack", label: "Snack" },
                        ].map((meal) => {
                          const enabled = formData.enabledMeals[meal.key as keyof typeof formData.enabledMeals];
                          return (
                            <div key={meal.key} className="space-y-1 rounded-lg border border-border/60 p-2 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <Label htmlFor={meal.key} className="text-xs font-semibold text-foreground">{meal.label}</Label>
                                <Switch
                                  id={`${meal.key}-toggle`}
                                  checked={enabled}
                                  onCheckedChange={(checked) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      enabledMeals: { ...prev.enabledMeals, [meal.key]: checked },
                                    }))
                                  }
                                />
                              </div>
                              <Input
                                id={meal.key}
                                type="time"
                                value={formData.mealTimes[meal.key as keyof typeof formData.mealTimes]}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    mealTimes: { ...prev.mealTimes, [meal.key]: e.target.value },
                                  }))
                                }
                                className="rounded-xl text-[11px]"
                                disabled={!enabled}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Additional Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="additionalNotes">Additional Notes</Label>
                      <Textarea
                        id="additionalNotes"
                        placeholder="Any allergies, preferences, or special requests..."
                        value={formData.additionalNotes}
                        onChange={(e) => setFormData(prev => ({ ...prev, additionalNotes: e.target.value }))}
                        className="rounded-xl min-h-[80px] resize-none"
                      />
                    </div>

                    {/* Start Date with calendar popover */}
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start rounded-xl bg-background text-left font-normal"
                          >
                            {formData.startDate
                              ? format(parseLocalDate(formData.startDate) as Date, "PP")
                              : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-3 w-auto" align="start">
                          <CalendarPicker
                            mode="single"
                            selected={parseLocalDate(formData.startDate)}
                            onSelect={(date) => {
                              if (date) {
                                const iso = format(date, "yyyy-MM-dd");
                                setFormData((prev) => ({ ...prev, startDate: iso }));
                              }
                            }}
                            modifiers={{ booked: bookedDates }}
                            modifiersClassNames={{
                              booked: "bg-primary/20 text-primary font-semibold hover:bg-primary/30",
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      variant="primary"
                      className="w-full rounded-xl"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate Plan
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="bg-muted/30 rounded-2xl p-4 border border-border/60 overflow-y-auto min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="relative w-full">
                        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          value={paletteSearch}
                          onChange={(e) => setPaletteSearch(e.target.value)}
                          placeholder="Search ingredients"
                          className="pl-9 rounded-xl"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-3 w-3 rounded-full bg-emerald-500" />
                        Use more
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-3 w-3 rounded-full bg-amber-500" />
                        Dislike
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-3 w-3 rounded-full bg-rose-500" />
                        Allergy
                      </span>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">Apply these choices to plan generation</Label>
                      <Switch
                        checked={applyIngredientGuidance}
                        onCheckedChange={setApplyIngredientGuidance}
                      />
                    </div>
                    <div className="space-y-6">
                      {filteredSections.map((section) => (
                        <div key={section.key} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-foreground">{section.title}</p>
                            <p className="text-xs text-muted-foreground">{section.items.length} staples</p>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 w-full min-w-0">
                            {section.items.map((item) => {
                              const mood = ingredientStatus[item.name] || null;
                              const moodClass = mood ? moodStyles[mood] : "border-transparent";
                              return (
                                <button
                                  key={item.name}
                                  type="button"
                                  onClick={() => cycleMood(item.name)}
                                  className={cn(
                                    "group relative rounded-2xl overflow-hidden border bg-background text-left shadow-sm hover:shadow-md transition w-full",
                                    moodClass
                                  )}
                                >
                                  <img
                                    src={iconFor(item.name)}
                                    alt={item.name}
                                    className="h-14 w-14 object-cover mx-auto mt-2 rounded-full"
                                    loading="lazy"
                                  />
                                  <div className="px-2 pb-2 pt-1.5 text-center">
                                    <p className="text-xs font-semibold text-foreground truncate">{item.name}</p>
                                    <p className="text-[10px] text-muted-foreground">Tap to cycle</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
