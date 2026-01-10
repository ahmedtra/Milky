import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NoSleep from "nosleep.js";
import { Button } from "@/components/ui/button";

interface CookModeProps {
  title?: string;
  steps: string[];
  onExit: () => void;
}

export function CookMode({ title = "Cook Mode", steps, onExit }: CookModeProps) {
  const [index, setIndex] = useState(0);
  const [voiceOn, setVoiceOn] = useState(false);
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
        className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6"
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
        <div className="text-sm uppercase tracking-wide text-white/70">{title}</div>
        <div className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-snug whitespace-pre-wrap max-w-5xl">
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
  );

  return createPortal(content, document.body);
}
