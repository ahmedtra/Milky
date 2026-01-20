import React, { useEffect, useRef } from "react";
import NoSleep from "nosleep.js";
import { createPortal } from "react-dom";
import { Check, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShoppingModeProps {
  title: string;
  itemsBySection: Array<{
    section: string;
    label: string;
    items: any[];
  }>;
  sectionStyles: Record<string, string>;
  onToggleItem: (item: any) => void;
  getItemKey: (item: any) => string;
  normalizeDisplayQuantity: (item: any) => { amount: number; unit: string };
  computeItemPrice: (item: any) => number;
  onExit: () => void;
}

export function ShoppingMode({
  title,
  itemsBySection,
  sectionStyles,
  onToggleItem,
  getItemKey,
  normalizeDisplayQuantity,
  computeItemPrice,
  onExit,
}: ShoppingModeProps) {
  const noSleepRef = useRef<NoSleep | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    try {
      noSleepRef.current = new NoSleep();
      noSleepRef.current.enable();
    } catch {
      /* ignore */
    }
    return () => {
      try {
        noSleepRef.current?.disable?.();
      } catch {
        /* ignore */
      }
      noSleepRef.current = null;
    };
  }, []);

  const content = (
    <div className="fixed inset-0 z-[300] bg-black/80 text-white flex flex-col pointer-events-auto">
      <div className="absolute top-4 right-4">
        <Button
          variant="outline"
          size="sm"
          className="bg-white/10 text-white border-white/40 hover:bg-white/20"
          onClick={onExit}
        >
          Exit
        </Button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col pt-16 pb-8 px-6 max-w-3xl w-full mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 mb-3">
            <ShoppingCart className="h-4 w-4" />
            <span className="text-sm font-semibold">Shopping Mode</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold">{title}</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5 overscroll-contain">
          {itemsBySection.map(({ section, label, items }) => (
            <div key={section} className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/70 font-semibold">
                <span className={cn("px-2 py-1 rounded-md", sectionStyles[section] || "bg-white/10 text-white")}>
                  {label}
                </span>
                <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="grid gap-2">
                {items.map((item) => {
                  const key = getItemKey(item);
                  const purchased = !!item.purchased;
                  const { amount, unit } = normalizeDisplayQuantity(item);
                  const quantity = [amount, unit].filter(Boolean).join(" ");
                  const price = computeItemPrice(item);
                  const hasPrice = price !== null && price !== undefined && !Number.isNaN(price);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onToggleItem(item)}
                      className={cn(
                        "w-full text-left rounded-lg border px-4 py-3 flex items-center gap-3 transition",
                        purchased
                          ? "bg-emerald-500/15 border-emerald-400/50 text-emerald-100"
                          : "bg-white/5 border-white/15 hover:border-white/40"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-semibold break-words", purchased && "line-through")}>
                          {item.name}
                        </p>
                        <div className="text-xs text-white/70 flex flex-wrap gap-2">
                          {quantity && <span>{quantity}</span>}
                          {hasPrice ? <span>${price.toFixed(2)}</span> : null}
                        </div>
                      </div>
                      {purchased && <Check className="h-4 w-4 shrink-0 text-emerald-200" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
