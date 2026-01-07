import React, { useMemo } from "react";
import { Navigation } from "@/components/layout/Navigation";
import { useMealPlans } from "@/hooks/use-meal-plans";
import { Card, CardContent } from "@/components/ui/card";
import { format, addDays, startOfDay, isAfter } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Sparkles } from "lucide-react";

type MacroTotals = { calories: number; protein: number; carbs: number; fat: number };

const colors = {
  calories: "hsl(143, 61%, 36%)",
  protein: "hsl(199, 89%, 48%)",
  carbs: "hsl(37, 88%, 50%)",
  fat: "hsl(328, 85%, 60%)",
};

const firstNumber = (...vals: any[]): number => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const sumMeal = (meal: any): MacroTotals => {
  const src = meal?.totalNutrition || meal?.nutrition || meal?.macros || meal?.recipes?.[0]?.nutrition || {};
  return {
    calories: firstNumber(src.calories),
    protein: firstNumber(src.protein, src.protein_g, src.protein_grams),
    carbs: firstNumber(src.carbs, src.carbs_g, src.carbs_grams),
    fat: firstNumber(src.fat, src.fat_g, src.fat_grams),
  };
};

export default function Macros() {
  const { data: plans = [], isLoading } = useMealPlans();

  const data = useMemo(() => {
    const relevantPlans = plans.filter((p: any) => p.status === "active" || p.status === "completed");
    const today = startOfDay(new Date());
    const map = new Map<
      string,
      {
        date: Date;
        total: MacroTotals;
        completed: MacroTotals;
      }
    >();

    const addToMap = (date: Date, totalAdd: MacroTotals, completedAdd: MacroTotals) => {
      const key = format(date, "yyyy-MM-dd");
      const existing = map.get(key) || {
        date,
        total: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        completed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      };
      const total = {
        calories: existing.total.calories + totalAdd.calories,
        protein: existing.total.protein + totalAdd.protein,
        carbs: existing.total.carbs + totalAdd.carbs,
        fat: existing.total.fat + totalAdd.fat,
      };
      const completed = {
        calories: existing.completed.calories + completedAdd.calories,
        protein: existing.completed.protein + completedAdd.protein,
        carbs: existing.completed.carbs + completedAdd.carbs,
        fat: existing.completed.fat + completedAdd.fat,
      };
      map.set(key, { date, total, completed });
    };

    relevantPlans.forEach((plan: any) => {
      const startDate = plan.startDate ? new Date(plan.startDate) : null;
      (plan.days || []).forEach((day: any, idx: number) => {
        const dayDate = day?.date ? new Date(day.date) : startDate ? addDays(startDate, idx) : null;
        if (!dayDate) return;
        const isFutureDay = isAfter(dayDate, today);
        // Only use future days from active plans; completed plans contribute only to history
        if (isFutureDay && plan.status !== "active") return;
        const dayTotal: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        const dayCompleted: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        (day.meals || []).forEach((meal: any) => {
          const m = sumMeal(meal);
          dayTotal.calories += m.calories;
          dayTotal.protein += m.protein;
          dayTotal.carbs += m.carbs;
          dayTotal.fat += m.fat;
          if (meal.isCompleted) {
            dayCompleted.calories += m.calories;
            dayCompleted.protein += m.protein;
            dayCompleted.carbs += m.carbs;
            dayCompleted.fat += m.fat;
          }
        });
        addToMap(dayDate, dayTotal, dayCompleted);
      });
    });

    const rows = Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    return rows.map((row) => {
      const isFuture = isAfter(row.date, today);
      const label = format(row.date, "MMM d");
      const actualCalories = !isFuture ? (row.completed.calories > 0 ? row.completed.calories : row.total.calories) : null;
      const actualProtein = !isFuture ? (row.completed.protein > 0 ? row.completed.protein : row.total.protein) : null;
      const actualCarbs = !isFuture ? (row.completed.carbs > 0 ? row.completed.carbs : row.total.carbs) : null;
      const actualFat = !isFuture ? (row.completed.fat > 0 ? row.completed.fat : row.total.fat) : null;

      return {
        label,
        date: row.date,
        actualCalories,
        actualProtein,
        actualCarbs,
        actualFat,
        forecastCalories: isFuture ? row.total.calories : null,
        forecastProtein: isFuture ? row.total.protein : null,
        forecastCarbs: isFuture ? row.total.carbs : null,
        forecastFat: isFuture ? row.total.fat : null,
      };
    });
  }, [plans]);

  const renderChart = (
    title: string,
    actualKey: keyof typeof data[number],
    forecastKey: keyof typeof data[number],
    colorActual: string,
    colorForecast: string,
    suffix = ""
  ) => (
    <Card className="glass-card overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-primary font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">Solid: completed | Dashed: planned</p>
          </div>
        </div>
        <div className="w-full overflow-x-auto md:overflow-visible pb-2">
          <div className="min-w-[560px] md:min-w-0 md:w-full pr-2 md:pr-0">
            <ChartContainer
              className="h-64 sm:h-72"
              config={{
                actual: { label: "Actual", color: colorActual },
                forecast: { label: "Planned", color: colorForecast },
              }}
            >
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Line
                  type="monotone"
                  dataKey={actualKey as string}
                  stroke={colorActual}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey={forecastKey as string}
                  stroke={colorForecast}
                  dot={false}
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  connectNulls
                />
              </LineChart>
            </ChartContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-32 md:pt-36 pb-12 px-4 md:px-8 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary">Macros Overview</span>
          </div>
          <div className="text-muted-foreground text-xs sm:text-sm">
            Summing all active meal plans; solid = completed meals, dashed = planned.
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading meal plans...</p>
        ) : data.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-6 text-center text-muted-foreground">
              No active meal plan data available yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderChart("Calories", "actualCalories", "forecastCalories", colors.calories, "hsl(148, 100%, 30%)", " kcal")}
            {renderChart("Protein (g)", "actualProtein", "forecastProtein", colors.protein, "hsl(210, 70%, 45%)", " g")}
            {renderChart("Carbs (g)", "actualCarbs", "forecastCarbs", colors.carbs, "hsl(45, 90%, 50%)", " g")}
            {renderChart("Fat (g)", "actualFat", "forecastFat", colors.fat, "hsl(330, 80%, 60%)", " g")}
          </div>
        )}
      </main>
    </div>
  );
}
