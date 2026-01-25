import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import React from "react";
import { Check } from "lucide-react";
import { CookMode } from "./CookMode";
import { resolveIngredientImages } from "@/lib/api";

interface MealDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meal: any;
  normalizeMealDetails: (meal: any) => {
    instructions: string[];
    ingredients: string[];
    time: string;
    macros: Record<string, number | string>;
    servings?: number | string;
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

  const { instructions, ingredients, time, macros, servings } = normalizeMealDetails(meal);
  const [cookMode, setCookMode] = React.useState(false);
  const [ingredientImages, setIngredientImages] = React.useState<string[]>([]);
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

  React.useEffect(() => {
    let active = true;
    if (!open || !ingredients.length) {
      setIngredientImages([]);
      return undefined;
    }
    resolveIngredientImages(ingredients)
      .then((results) => {
        if (!active) return;
        setIngredientImages(results.map((item) => item?.imageUrl || ""));
      })
      .catch(() => {
        if (!active) return;
        setIngredientImages([]);
      });
    return () => {
      active = false;
    };
  }, [open, ingredients]);

  const recipe = meal?.recipes?.[0] || {};
  const servingsLabel =
    Number.isFinite(Number(servings)) && Number(servings) > 0
      ? `• Serves ${Number(servings)}`
      : "• Serves —";
  const img = recipe?.image || recipe?.imageUrl || meal?.image || meal?.imageUrl;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" hideClose aria-describedby={undefined}>
        <DialogTitle className="sr-only">Meal details</DialogTitle>
        <div className="relative px-6 py-4">
          <div className="sticky top-1/2 -translate-y-1/2 z-10 h-0">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -left-12 rounded-full bg-background shadow-md"
              onClick={onPrev}
              aria-label="Previous meal"
            >
              ◀
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-12 rounded-full bg-background shadow-md"
              onClick={onNext}
              aria-label="Next meal"
            >
              ▶
            </Button>
          </div>

          <div className="space-y-4 pr-1">
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

            {img ? (
              <img
                src={img}
                alt={meal.recipes?.[0]?.name || meal.type || "Meal"}
                className="w-full h-48 rounded-lg object-cover border border-border/60"
              />
            ) : null}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {macros.calories ? `${macros.calories} cal` : "— cal"}{" "}
              {macros.protein ? `• ${macros.protein}g protein` : ""}
              <span>{servingsLabel}</span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Ingredients</p>
              {ingredients.length ? (
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {ingredients.map((ing, ingIdx) => (
                    <li key={ingIdx} className="flex items-start gap-3">
                      {ingredientImages[ingIdx] ? (
                        <img
                          src={ingredientImages[ingIdx]}
                          alt={ing}
                          className="h-8 w-8 rounded-full object-cover border border-border/60"
                          loading="lazy"
                        />
                      ) : null}
                      <span className="break-words break-all whitespace-pre-wrap">{ing}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ingredients not available.</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Instructions</p>
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

            <div className="mt-4 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                disabled={!instructionsArray.length}
                onClick={() => setCookMode(true)}
              >
                Start Cook Mode
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
      {cookMode && (
        <CookMode
          title={meal.recipes?.[0]?.name || meal.type || "Recipe"}
          steps={instructionsArray}
          ingredients={ingredients}
          ingredientImages={ingredientImages}
          servings={servings}
          onExit={() => setCookMode(false)}
        />
      )}
    </Dialog>
  );
}
