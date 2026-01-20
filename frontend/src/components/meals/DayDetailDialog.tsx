import React from "react";
import { format, addDays } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDayLabel } from "@/lib/types";
import { ChevronLeft, ChevronRight, Sparkles, Star, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";

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
  onApplyAlternative: (dayIdx: number, mealIdx: number, recipeId?: string, recipe?: any) => void;
  onToggleMeal: (dayIdx: number, mealIdx: number, isCompleted: boolean) => void;
  onDeleteMeal: (dayIdx: number, mealIdx: number) => void;
  startDate?: string;
  onUpdateStartDate?: (date: string) => void;
  highlightDates?: Array<string | Date>;
  favorites?: any[];
  onFavorite?: (dayIdx: number, mealIdx: number) => void;
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
  startDate,
  onUpdateStartDate,
  highlightDates = [],
  favorites = [],
  onFavorite,
}: DayDetailDialogProps) {
  const safeIndex = Math.max(0, Math.min(selectedDayIndex, Math.max(0, days.length - 1)));
  const currentDay = days[safeIndex];
  const parseLocalDate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const dayDates = React.useMemo(() => {
    return (days || []).map((day, idx) => {
      const dayDate = parseLocalDate(day?.date as any);
      if (dayDate) return dayDate;
      const base = parseLocalDate(startDate);
      if (base) return addDays(base, idx);
      return null;
    });
  }, [days, startDate]);

  const normalize = (d: Date | null) => (d ? format(d, "yyyy-MM-dd") : "");
  const selectedDate = dayDates[safeIndex] || null;
  const selectedDateStr = normalize(selectedDate);
  const bookedDates = [
    ...dayDates.filter(Boolean),
    ...highlightDates
      .map((d) => parseLocalDate(d as any))
      .filter(Boolean),
  ] as Date[];
  const altOptions = React.useMemo(() => {
    const nonFavorite = swapState.options.filter(
      (opt: any) => !(opt?.planRecipe || opt?.isFavorite)
    );
    const base = nonFavorite.length ? nonFavorite : swapState.options;
    return Array.isArray(base) ? base.slice(0, 3) : [];
  }, [swapState.options]);

  const normalizeName = (value?: string | null) =>
    (value || "")
      .toString()
      .toLowerCase()
      .trim();

  const favoriteNameSet = React.useMemo(() => {
    const set = new Set<string>();
    (favorites || []).forEach((fav) => {
      const name = fav?.name || fav?.title;
      const norm = normalizeName(name);
      if (norm) set.add(norm);
    });
    return set;
  }, [favorites]);

  // Swipe to change day
  const touchStartX = React.useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    const threshold = 40;
    if (Math.abs(deltaX) > threshold) {
      onChangeDay(deltaX < 0 ? 1 : -1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent
        className="max-w-[1100px] w-[min(96vw,1100px)] p-0 bg-transparent border-0 shadow-none overflow-visible flex flex-col"
        hideClose
        onWheel={onWheel}
        aria-describedby={undefined}
      >
        {/* Rounded container */}
        <div className="relative bg-white rounded-[28px] border border-border/60 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <Button
            variant="ghost"
            onClick={onClose}
            className="absolute right-4 top-3 z-[120] text-foreground"
          >
            Close
          </Button>

          {/* Global overlay arrows kept outside content to avoid clipping */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-3 z-[110]">
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto rounded-full bg-white/95 border shadow-lg hover:bg-accent -translate-x-5"
              onClick={() => onChangeDay(-1)}
              disabled={safeIndex === 0}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto rounded-full bg-white/95 border shadow-lg hover:bg-accent translate-x-5"
              onClick={() => onChangeDay(1)}
              disabled={safeIndex === days.length - 1}
              aria-label="Next day"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Single day view */}
          <div
            className="flex-1 w-full min-w-0 overflow-y-auto px-4 pb-4 pt-5"
            style={{ touchAction: "pan-y" }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {currentDay && (
              <div className="relative h-full overflow-visible">
                <div className="h-full space-y-4 bg-white rounded-2xl p-4 box-border">
                  {/* Day header */}
                  <div className="flex items-start justify-between gap-3 pr-10">
                    <div>
                      <p className="text-sm text-primary font-semibold">Day</p>
                      <h3 className="text-2xl font-bold text-foreground">
                        {getDayLabel(currentDay as any, safeIndex)}
                      </h3>
                      <p className="text-sm text-muted-foreground">{(currentDay.meals || []).length} meals</p>
                    </div>
                  </div>

                  {/* Day info */}
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium">
                      {selectedDate
                        ? format(selectedDate, "PP")
                        : getDayLabel(currentDay as any, safeIndex)}
                    </div>
                    <span className="text-sm text-muted-foreground">{(currentDay.meals || []).length} meals</span>
                  </div>

                  {/* Meal cards */}
                  <div className="space-y-3">
                    {(currentDay.meals || []).map((meal: Meal, mIdx: number) => {
                      const recipe = meal?.recipes?.[0] || {};
                      const img = recipe?.image || recipe?.imageUrl || meal?.image || meal?.imageUrl;
                      const recipeName = recipe?.name || recipe?.title || "";
                      const isLlmFallback = Array.isArray(recipe?.tags) && recipe.tags.includes("llm-fallback");
                      const isSwapOpen = swapState.key === swapKeyFor(planId, safeIndex, mIdx);
                      const isFavorite = !!recipeName && favoriteNameSet.has(normalizeName(recipeName)) && !isSwapOpen;
                      return (
                      <div
                        key={meal.mealId || meal._id || mIdx}
                        className={cn(
                          "w-full p-4 rounded-xl border bg-card shadow-sm cursor-pointer hover:shadow-md transition-shadow",
                          isFavorite && "border-amber-300 bg-amber-50/80 shadow-[0_16px_40px_-18px_rgba(245,158,11,0.45)]"
                        )}
                        onClick={() => onSelectMeal(safeIndex, mIdx)}
                      >
                        <div className="flex items-stretch gap-3">
                          <div className="w-24 sm:w-28 shrink-0 rounded-lg overflow-hidden border border-border/60 bg-secondary">
                            {img ? (
                              <img
                                src={img}
                                alt={recipe.name || meal.type || "Meal"}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground">
                                No image
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col justify-between">
                            <div>
                              <p className="font-semibold text-foreground text-base md:text-lg leading-snug line-clamp-2">
                                {recipe.name || meal.type || "Meal"}
                              </p>
                              <p className="text-xs sm:text-sm text-muted-foreground truncate flex items-center gap-2">
                                <span>{meal.type || "Meal"}</span>
                                {Array.isArray(recipe.tags) && recipe.tags.includes("llm-fallback") && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                                    <Sparkles className="h-3 w-3 text-primary" />
                                    AI generated
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="flex flex-nowrap items-center justify-end gap-2 w-full">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSwapOpen(safeIndex, mIdx);
                                }}
                                className="h-10 w-10 p-0 flex items-center justify-center"
                              >
                                <RefreshCw className="h-5 w-5" />
                              </Button>
                              <Button
                                variant={meal.isCompleted ? "outline" : "secondary"}
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleMeal(safeIndex, mIdx, !meal.isCompleted);
                                }}
                                className={cn(
                                  "h-10 w-10 p-0 flex items-center justify-center",
                                  meal.isCompleted ? "border-green-500 text-green-600" : ""
                                )}
                              >
                                ✓
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onFavorite?.(safeIndex, mIdx);
                                }}
                                className={cn(
                                  "h-10 w-10 p-0 flex items-center justify-center text-amber-500 hover:text-amber-600",
                                  isFavorite && "ring-2 ring-amber-200 shadow-sm"
                                )}
                              >
                                <Star
                                  className={cn(
                                    "h-6 w-6 fill-amber-400 text-amber-500",
                                    isFavorite && "drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                                  )}
                                />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteMeal(safeIndex, mIdx);
                                }}
                                className="h-10 w-10 p-0 flex items-center justify-center"
                              >
                                ✕
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Swap alternatives */}
                        {swapState.key === swapKeyFor(planId, safeIndex, mIdx) && (
                          <div className="mt-3 p-3 rounded-lg bg-secondary max-h-48 overflow-y-auto">
                            {swapState.loading ? (
                              <p className="text-sm text-muted-foreground">Loading alternatives...</p>
                            ) : altOptions.length ? (
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  {altOptions.map((opt, altIdx) => (
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
                                        variant="primary"
                                        size="sm"
                                        disabled={swapState.applying}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onApplyAlternative(
                                            safeIndex,
                                            mIdx,
                                            opt?.recipeId || opt?._id || opt?.id,
                                            opt?.recipe
                                          );
                                        }}
                                      >
                                        {swapState.applying ? "Applying..." : "Use"}
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                                {favorites.length > 0 && (
                                  <div className="pt-2 border-t border-border/60">
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">Favorites</p>
                                    <div className="flex gap-2 overflow-x-auto pb-2">
                                      {favorites.map((fav, idx) => (
                                        <button
                                          key={idx}
                                          className="group flex flex-col items-start gap-2 px-3 py-3 rounded-lg border border-border/60 border-dashed bg-white text-left min-w-[220px] max-w-[260px] hover:border-primary/60"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onApplyAlternative(
                                              safeIndex,
                                              mIdx,
                                              undefined,
                                              fav?.planRecipe || fav?.recipe || fav
                                            );
                                          }}
                                        >
                                          {(() => {
                                            const img =
                                              fav?.planRecipe?.image ||
                                              fav?.planRecipe?.imageUrl ||
                                              fav?.image ||
                                              fav?.imageUrl ||
                                              fav?.recipe?.image ||
                                              fav?.recipe?.imageUrl;
                                            return img ? (
                                              <img
                                                src={img}
                                                alt={fav?.title || fav?.name || fav?.planRecipe?.title || "Favorite"}
                                                className="w-full h-28 rounded-lg object-cover border border-border/50"
                                              />
                                            ) : (
                                              <div className="w-full h-28 rounded-lg bg-secondary flex items-center justify-center text-xs text-muted-foreground border border-border/50">
                                                No image
                                              </div>
                                            );
                                          })()}
                                          <div className="min-w-0 w-full">
                                            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                                              {fav?.title || fav?.name || fav?.planRecipe?.title || fav?.planRecipe?.name || "Favorite"}
                                            </p>
                                            <p className="text-xs text-muted-foreground line-clamp-2">
                                              {fav?.planRecipe?.description || fav?.description || ""}
                                            </p>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No alternatives found.</p>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}
                    {(currentDay.meals || []).length === 0 && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2 py-8 justify-center">
                        <Sparkles className="h-4 w-4" /> No meals for this day yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
