import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NoSleep from "nosleep.js";
import { Button } from "@/components/ui/button";
import { resolveIngredientImages } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CookModeProps {
  title?: string;
  steps: string[];
  ingredients?: string[];
  ingredientImages?: string[];
  servings?: number | string;
  onExit: () => void;
}

export function CookMode({
  title = "Cook Mode",
  steps,
  ingredients = [],
  ingredientImages = [],
  servings,
  onExit,
}: CookModeProps) {
  const [index, setIndex] = useState(0);
  const [voiceOn, setVoiceOn] = useState(false);
  const [resolvedImages, setResolvedImages] = useState<string[]>([]);
  const touchStartX = useRef<number | null>(null);
  const tapTimeoutRef = useRef<number | null>(null);
  const noSleepRef = useRef<NoSleep | null>(null);

  const safeSteps = (() => {
    if (Array.isArray(steps) && steps.length) return steps;
    if (typeof steps === "string") {
      const split = steps.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      return split.length ? split : ["No steps provided."];
    }
    return ["No steps provided."];
  })();

  const goNext = () => setIndex((prev) => Math.min(prev + 1, safeSteps.length - 1));
  const goPrev = () => setIndex((prev) => Math.max(prev - 1, 0));

  const safeIngredients = Array.isArray(ingredients)
    ? ingredients.map((ing) => (typeof ing === "string" ? ing.trim() : "")).filter(Boolean)
    : [];
  const safeIngredientImages = Array.isArray(ingredientImages) ? ingredientImages : [];
  const effectiveImages = safeIngredientImages.length ? safeIngredientImages : resolvedImages;
  const ingredientEntries = safeIngredients.map((text, idx) => ({
    text,
    imageUrl: effectiveImages[idx] || "",
  }));

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const ingredientKey = (ingredient: string) => {
    let cleaned = ingredient.toLowerCase();
    cleaned = cleaned.replace(/\([^)]*\)/g, " ");
    cleaned = cleaned.replace(/[¼½¾⅓⅔]/g, " ");
    cleaned = cleaned.replace(/[\d/.,]+/g, " ");
    cleaned = cleaned.replace(
      /\b(cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|g|kg|ml|l|lb|oz|unit|units|cloves?|slice|slices|can|cans|jar|jars|pkg|package|packages|pinch|dash|large|medium|small|x-large|xl)\b/g,
      " "
    );
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    return cleaned;
  };

  const stepIngredients = (() => {
    if (!ingredientEntries.length) return [];
    const step = String(safeSteps[index] || "").toLowerCase();
    return ingredientEntries.filter((ingredient) => {
      const key = ingredientKey(ingredient.text);
      if (!key) return false;
      if (step.includes(key)) return true;
      const words = key.split(" ").filter((w) => w.length > 3);
      return words.some((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(step));
    });
  })();

  useEffect(() => {
    // Keep screen awake
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
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (safeIngredientImages.length || !safeIngredients.length) {
      setResolvedImages([]);
      return undefined;
    }
    resolveIngredientImages(safeIngredients)
      .then((results) => {
        if (!active) return;
        setResolvedImages(results.map((item) => item?.imageUrl || ""));
      })
      .catch(() => {
        if (!active) return;
        setResolvedImages([]);
      });
    return () => {
      active = false;
    };
  }, [safeIngredients, safeIngredientImages.length]);

  useEffect(() => {
    if (voiceOn) speak(index);
    else {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  }, [index, voiceOn]);

  const speak = (idx: number) => {
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(safeSteps[idx]);
      window.speechSynthesis.speak(utter);
    } catch {
      /* ignore */
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    const threshold = 40;
    if (Math.abs(deltaX) > threshold) {
      deltaX < 0 ? goNext() : goPrev();
    }
  };

  const handleTap = () => {
    if (tapTimeoutRef.current) {
      window.clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
      goPrev();
    } else {
      tapTimeoutRef.current = window.setTimeout(() => {
        goNext();
        tapTimeoutRef.current = null;
      }, 200);
    }
  };

  const stopAll = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const servingsLabel =
    Number.isFinite(Number(servings)) && Number(servings) > 0
      ? `Serves ${Number(servings)}`
      : null;

  const content = (
    <div
      className="fixed inset-0 z-[300] bg-black/80 text-white flex flex-col pointer-events-auto"
      style={{ touchAction: "none" }}
    >
      <div className="absolute top-4 right-4">
        <Button
          variant="outline"
          size="sm"
          className="bg-white/10 text-white border-white/40 hover:bg-white/20"
          onClick={(e) => {
            stopAll(e);
            onExit();
          }}
        >
          Exit
        </Button>
      </div>
      <div
        className={cn(
          "flex-1 flex flex-col items-center px-6 text-center",
          stepIngredients.length > 0 ? "pt-8" : "pt-10"
        )}
        onClick={(e) => {
          stopAll(e);
          handleTap();
        }}
        onTouchStart={(e) => {
          stopAll(e);
          handleTouchStart(e);
        }}
        onTouchEnd={(e) => {
          stopAll(e);
          handleTouchEnd(e);
        }}
      >
        {stepIngredients.length > 0 && (
          <div className="w-full max-w-5xl flex flex-wrap justify-center gap-3">
            {stepIngredients.map((ingredient, idx) => (
              <div
                key={`${ingredient.text}-${idx}`}
                className="flex flex-col items-center justify-center gap-2 w-36 h-36 rounded-full bg-white/15 border border-white/30 text-sm sm:text-base text-white/95"
              >
                {ingredient.imageUrl ? (
                  <img
                    src={ingredient.imageUrl}
                    alt={ingredient.text}
                    className="h-16 w-16 rounded-full object-cover border border-white/20 flex-shrink-0"
                    loading="eager"
                  />
                ) : null}
                <span className="px-2 text-center line-clamp-3">{ingredient.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 w-full">
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="text-sm uppercase tracking-wide text-white/70">{title}</div>
            {servingsLabel ? (
              <div className="text-xs text-white/60">{servingsLabel}</div>
            ) : null}
          </div>
          <div className="text-3xl sm:text-4xl md:text-5xl font-semibold leading-snug whitespace-pre-wrap max-w-5xl text-center">
            {safeSteps[index]}
          </div>
          <div className="flex items-center gap-3 text-white/80 text-sm">
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/15 border-white/30 text-white"
              onClick={(e) => {
                stopAll(e);
                goPrev();
              }}
            >
              Prev
            </Button>
            <span className="text-white/80">
              {index + 1} / {safeSteps.length}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className={`border-white/30 text-white ${voiceOn ? "bg-green-600/70 hover:bg-green-600" : "bg-white/15 hover:bg-white/20"}`}
              onClick={(e) => {
                stopAll(e);
                setVoiceOn((v) => !v);
              }}
            >
              {voiceOn ? "Voice On" : "Voice Off"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/15 border-white/30 text-white"
              onClick={(e) => {
                stopAll(e);
                goNext();
              }}
            >
              Next
            </Button>
          </div>
          <p className="text-xs text-white/60">
            Tap anywhere to advance, double-tap to go back. Swipe left/right also works.
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
