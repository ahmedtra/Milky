import React from "react";
import { format, addDays } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDayLabel } from "@/lib/types";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
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
  onApplyAlternative: (dayIdx: number, mealIdx: number, recipeId: string) => void;
  onToggleMeal: (dayIdx: number, mealIdx: number, isCompleted: boolean) => void;
  onDeleteMeal: (dayIdx: number, mealIdx: number) => void;
  startDate?: string;
  onUpdateStartDate?: (date: string) => void;
  highlightDates?: Array<string | Date>;
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
}: DayDetailDialogProps) {
  const safeIndex = Math.max(0, Math.min(selectedDayIndex, Math.max(0, days.length - 1)));
  const currentDay = days[safeIndex];
  const dayDates = React.useMemo(() => {
    return (days || []).map((day, idx) => {
      if (day?.date) return new Date(day.date as any);
      if (startDate) return addDays(new Date(startDate), idx);
      return null;
    });
  }, [days, startDate]);

  const normalize = (d: Date | null) => (d ? format(d, "yyyy-MM-dd") : "");
  const selectedDateStr = normalize(dayDates[safeIndex] || null);
  const bookedDates = [...dayDates.filter(Boolean), ...highlightDates.map((d) => new Date(d as any))] as Date[];

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const target = normalize(date);
    const idx = dayDates.findIndex((d) => normalize(d as Date) === target);
    if (idx >= 0) {
      onSelectDay(idx);
      if (onUpdateStartDate) {
        const newStart = addDays(date, -idx);
        onUpdateStartDate(format(newStart, "yyyy-MM-dd"));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent
        className="max-w-[1100px] w-[min(96vw,1100px)] p-0 bg-transparent border-0 shadow-none overflow-visible"
        onWheel={onWheel}
        aria-describedby={undefined}
      >
        {/* Rounded container */}
        <div className="relative bg-white rounded-[28px] border border-border/60 shadow-2xl max-h-[90vh] overflow-hidden">
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
          <div className="flex-1 w-full min-w-0 overflow-hidden px-4 pb-4 pt-5" style={{ touchAction: "pan-y" }}>
            {currentDay && (
              <div className="relative h-full overflow-visible">
                <div className="h-full overflow-y-auto space-y-4 bg-white rounded-2xl p-4 box-border">
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

                  {/* Day date selector (matches generation form style) */}
                  <div className="flex items-center gap-3">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="bg-background text-foreground font-medium">
                          {selectedDateStr
                            ? format(new Date(selectedDateStr), "PP")
                            : getDayLabel(currentDay as any, safeIndex)}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-3 w-auto" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={selectedDateStr ? new Date(selectedDateStr) : undefined}
                          onSelect={handleDateSelect}
                          modifiers={{ booked: bookedDates }}
                          modifiersClassNames={{
                            booked: "bg-primary/20 text-primary font-semibold hover:bg-primary/30",
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <span className="text-sm text-muted-foreground">{(currentDay.meals || []).length} meals</span>
                  </div>

                  {/* Meal cards */}
                  <div className="space-y-3">
                    {(currentDay.meals || []).map((meal: Meal, mIdx: number) => (
                      <div
                        key={meal.mealId || meal._id || mIdx}
                        className="w-full p-4 rounded-xl border bg-card shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => onSelectMeal(safeIndex, mIdx)}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground text-sm md:text-base leading-snug line-clamp-2">
                              {meal.recipes?.[0]?.name || meal.type || "Meal"}
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate">
                              {meal.type || "Meal"}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0 flex-wrap justify-end w-full sm:w-auto sm:ml-auto sm:justify-end">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSwapOpen(safeIndex, mIdx);
                              }}
                            >
                              Swap
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleMeal(safeIndex, mIdx, !meal.isCompleted);
                              }}
                            >
                              {meal.isCompleted ? "✓" : "Done"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteMeal(safeIndex, mIdx);
                              }}
                            >
                              ✕
                            </Button>
                          </div>
                        </div>

                        {/* Swap alternatives */}
                        {swapState.key === swapKeyFor(planId, safeIndex, mIdx) && (
                          <div className="mt-3 p-3 rounded-lg bg-secondary max-h-48 overflow-y-auto">
                            {swapState.loading ? (
                              <p className="text-sm text-muted-foreground">Loading alternatives...</p>
                            ) : swapState.options.length ? (
                              <div className="space-y-2">
                                {swapState.options.map((opt, altIdx) => (
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
                                          opt?.recipeId || opt?._id || opt?.id
                                        );
                                      }}
                                    >
                                      {swapState.applying ? "Applying..." : "Use"}
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
