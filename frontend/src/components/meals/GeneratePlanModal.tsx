import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2 } from "lucide-react";
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
    onSubmit(formData);
  };

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
            <div className="glass-card-elevated p-6 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
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
                  <Label htmlFor="allergies">Allergies</Label>
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
                  <Label htmlFor="includeIngredients">Use These Ingredients</Label>
                  <Input
                    id="includeIngredients"
                    placeholder="e.g., chicken breast, broccoli, rice"
                    value={formData.includeIngredients}
                    onChange={(e) => setFormData(prev => ({ ...prev, includeIngredients: e.target.value }))}
                    className="rounded-xl"
                  />
                  <p className="text-sm text-muted-foreground">Comma-separated ingredients to prioritize in ES recipe search</p>
                </div>

                {/* Disliked Foods */}
                <div className="space-y-2">
                  <Label htmlFor="dislikedFoods">Disliked Foods</Label>
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
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: "breakfast", label: "Breakfast" },
                      { key: "lunch", label: "Lunch" },
                      { key: "dinner", label: "Dinner" },
                      { key: "snack", label: "Snack" },
                    ].map((meal) => {
                      const enabled = formData.enabledMeals[meal.key as keyof typeof formData.enabledMeals];
                      return (
                        <div key={meal.key} className="space-y-1 rounded-lg border border-border/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor={meal.key} className="text-sm font-semibold text-foreground">{meal.label}</Label>
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
                            className="rounded-xl"
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
