import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import React from "react";
import { Check } from "lucide-react";
import { CookMode } from "./CookMode";

interface MealDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meal: any;
  normalizeMealDetails: (meal: any) => {
    instructions: string[];
    ingredients: string[];
    time: string;
    macros: Record<string, number | string>;
  };
  onSwap: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
  onNext: () => void;
  onPrev: () => void;
  isCompleted?: boolean;
}

export function MealDetailDialog({
  open,
  onOpenChange,
  meal,
  normalizeMealDetails,
  onSwap,
  onToggleComplete,
  onDelete,
  onNext,
  onPrev,
  isCompleted,
}: MealDetailDialogProps) {
  if (!meal) return null;

  const { instructions, ingredients, time, macros } = normalizeMealDetails(meal);
  const [cookMode, setCookMode] = React.useState(false);
  const instructionsArray = React.useMemo(() => {
    if (Array.isArray(instructions)) {
      // If the array contains a single blob, split that blob by newlines
      if (instructions.length === 1 && typeof instructions[0] === "string") {
        return instructions[0]
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return instructions.filter(Boolean);
    }
    if (typeof instructions === "string") {
      return instructions
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }, [instructions]);

  const handleOpenChange = (val: boolean) => {
    if (cookMode) return;
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden" hideClose aria-describedby={undefined}>
        <DialogTitle className="sr-only">Meal details</DialogTitle>
        <div className="relative px-6 py-4 max-h-[90vh]">
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background shadow-md"
            onClick={onPrev}
            aria-label="Previous meal"
          >
            ◀
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background shadow-md"
            onClick={onNext}
            aria-label="Next meal"
          >
            ▶
          </Button>

          <div className="space-y-4 overflow-y-auto max-h-[78vh] pr-1">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm text-primary font-semibold">Meal</p>
                <h3 className="text-2xl font-bold text-foreground">
                  {meal.recipes?.[0]?.name || meal.type || "Meal"}
                </h3>
                <p className="text-sm text-muted-foreground">{meal.type || "Meal"}</p>
              </div>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border bg-white/70 space-y-2 w-full max-w-full md:max-w-[34rem]">
                <h4 className="font-semibold text-foreground mb-2">Instructions</h4>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!instructionsArray.length}
                    onClick={() => setCookMode(true)}
                  >
                    Start Cook Mode
                  </Button>
                </div>
                {instructionsArray.length ? (
                  <div className="space-y-1 text-sm text-muted-foreground break-words max-w-full overflow-hidden">
                    {instructionsArray.map((step, stepIdx) => (
                      <div key={stepIdx} className="flex items-start gap-2 text-left">
                        <span className="text-primary font-semibold flex-shrink-0">{stepIdx + 1}.</span>
                        <span className="flex-1 min-w-0 break-words break-all whitespace-pre-wrap">{step}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No instructions provided.</p>
                )}
              </div>
              <div className="p-4 rounded-xl border bg-white/70 space-y-2 w-full max-w-full md:max-w-[34rem]">
                <h4 className="font-semibold text-foreground mb-2">Ingredients</h4>
                {ingredients.length ? (
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 break-words">
                    {ingredients.map((ing, ingIdx) => (
                      <li key={ingIdx} className="break-words break-all whitespace-pre-wrap">{ing}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Ingredients not available.</p>
                )}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-primary/10 text-primary font-semibold text-center">
                Protein: {macros.protein}
              </div>
              <div className="p-3 rounded-lg bg-primary/10 text-primary font-semibold text-center">
                Carbs: {macros.carbs}
              </div>
              <div className="p-3 rounded-lg bg-primary/10 text-primary font-semibold text-center">
                Fats: {macros.fats}
              </div>
              <div className="p-3 rounded-lg bg-primary/10 text-primary font-semibold text-center">
                Fiber: {macros.fiber}
              </div>
              <div className="p-3 rounded-lg bg-primary/10 text-primary font-semibold text-center">
                Sugar: {macros.sugar}
              </div>
              <div className="p-3 rounded-lg bg-primary/10 text-primary font-semibold text-center">
                Calories: {macros.calories}
              </div>
              <div className="p-3 rounded-lg bg-primary/10 text-primary font-semibold text-center col-span-2 md:col-span-3">
                Time: {time || "--:--"}
              </div>
            </div>

            <div className="mt-2 flex gap-2 flex-wrap justify-end">
              <Button variant="secondary" size="sm" onClick={onSwap}>
                Swap
              </Button>
              <Button variant="secondary" size="sm" onClick={onToggleComplete}>
                {isCompleted ? "Completed" : "Complete"}
              </Button>
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Delete
              </Button>
              {isCompleted && <Check className="h-4 w-4 text-primary" />}
            </div>
          </div>
        </div>
      </DialogContent>
      {cookMode && (
        <CookMode
          title={meal.recipes?.[0]?.name || meal.type || "Recipe"}
          steps={instructionsArray}
          onExit={() => setCookMode(false)}
        />
      )}
    </Dialog>
  );
}
