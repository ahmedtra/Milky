import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getDayLabel } from "@/lib/types";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import React from "react";

type Meal = any;
type Day = { meals?: Meal[] };

interface DayDetailDialogProps {
  open: boolean;
  planId: string;
  days: Day[];
  selectedDayIndex: number;
  onClose: () => void;
  onSelectDay: (idx: number) => void;
  onSelectMeal: (dayIdx: number, mealIdx: number) => void;
  onChangeDay: (step: number) => void;
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  swapState: { key: string | null; options: any[]; loading: boolean; applying: boolean };
  swapKeyFor: (planId: string, dayIndex: number, mealIndex: number) => string;
  onSwapOpen: (dayIdx: number, mealIdx: number) => void;
  onApplyAlternative: (dayIdx: number, mealIdx: number, recipeId: string) => void;
  onToggleMeal: (dayIdx: number, mealIdx: number, isCompleted: boolean) => void;
  onDeleteMeal: (dayIdx: number, mealIdx: number) => void;
}

export function DayDetailDialog({
  open,
  planId,
  days,
  selectedDayIndex,
  onClose,
  onSelectDay,
  onSelectMeal,
  onChangeDay,
  onWheel,
  swapState,
  swapKeyFor,
  onSwapOpen,
  onApplyAlternative,
  onToggleMeal,
  onDeleteMeal,
}: DayDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent
        className="w-[min(96vw,1100px)] max-h-[85vh] p-0 overflow-hidden"
        onWheel={onWheel}
        aria-describedby={undefined}
      >
        <div className="relative max-h-[85vh]">
          {/* Top bar with arrows and close */}
          <div className="flex items-center justify-between gap-3 px-6 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full bg-background border shadow-md hover:bg-accent"
                onClick={() => onChangeDay(-1)}
                disabled={selectedDayIndex === 0}
                aria-label="Previous day"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full bg-background border shadow-md hover:bg-accent"
                onClick={() => onChangeDay(1)}
                disabled={selectedDayIndex === days.length - 1}
                aria-label="Next day"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="relative w-full min-w-0 overflow-hidden rounded-2xl bg-background/70 px-6 pb-6" style={{ overscrollBehavior: "contain" }}>
            <div
              className="flex transition-transform duration-300 ease-out min-w-0"
              style={{ transform: `translateX(-${selectedDayIndex * 100}%)` }}
            >
              {days.map((day, idx) => (
                <div
                  key={`day-slide-${idx}`}
                  className="w-full flex-shrink-0 flex-grow-0 basis-full min-w-0 overflow-y-auto max-h-[75vh] space-y-4 box-border"
                >
                  {/* Day header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-primary font-semibold">Day</p>
                      <h3 className="text-2xl font-bold text-foreground">{getDayLabel(day as any, idx)}</h3>
                      <p className="text-sm text-muted-foreground">{(day.meals || []).length} meals</p>
                    </div>
                  </div>

                  {/* Day chips navigation */}
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 pb-2 snap-x snap-mandatory">
                      {days.map((d, j) => (
                        <button
                          key={`chip-${j}`}
                          className={cn(
                            "snap-center px-4 py-2 rounded-full border text-sm transition whitespace-nowrap",
                            idx === j 
                              ? "border-primary bg-primary/10 text-primary font-semibold" 
                              : "border-border bg-secondary/60 hover:border-primary/50"
                          )}
                          onClick={() => onSelectDay(j)}
                        >
                          {getDayLabel(d as any, j)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Meal cards */}
                  <div className="space-y-3">
                    {(day.meals || []).map((meal: Meal, mIdx: number) => (
                      <div
                        key={meal.mealId || meal._id || mIdx}
                        className="p-4 rounded-xl border bg-card shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => onSelectMeal(idx, mIdx)}
                      >
                        {/* Meal row - flex with min-w-0 to prevent overflow */}
                        <div className="flex items-center gap-4">
                          {/* Text content - min-w-0 allows truncation */}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground truncate">
                              {meal.recipes?.[0]?.name || meal.type || "Meal"}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {meal.type || "Meal"}
                            </p>
                          </div>
                          {/* Buttons - shrink-0 prevents compression */}
                          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSwapOpen(idx, mIdx);
                              }}
                            >
                              Swap
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleMeal(idx, mIdx, !meal.isCompleted);
                              }}
                            >
                              {meal.isCompleted ? "✓" : "Done"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteMeal(idx, mIdx);
                              }}
                            >
                              ✕
                            </Button>
                          </div>
                        </div>

                        {/* Swap alternatives panel */}
                        {swapState.key === swapKeyFor(planId, idx, mIdx) && (
                          <div className="mt-3 p-3 rounded-lg bg-secondary">
                            {swapState.loading ? (
                              <p className="text-sm text-muted-foreground">Loading alternatives...</p>
                            ) : swapState.options.length ? (
                              <div className="space-y-2">
                                {swapState.options.map((opt, altIdx) => (
                                  <div key={altIdx} className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1">
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
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onApplyAlternative(idx, mIdx, opt?.recipeId || opt?._id || opt?.id);
                                      }}
                                    >
                                      {swapState.applying ? "..." : "Use"}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No alternatives found.</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {(day.meals || []).length === 0 && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2 py-8 justify-center">
                        <Sparkles className="h-4 w-4" /> No meals for this day yet
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
