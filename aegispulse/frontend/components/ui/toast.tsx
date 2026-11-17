"use client";

import { CircleCheck, CircleX, Info } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { cn } from "@/lib/format";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const ToastContext = createContext<(tone: Tone, title: string, body?: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Tone, title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex gap-3 rounded-lg border bg-ink-850/95 p-3 shadow-xl backdrop-blur",
              t.tone === "success" && "border-emerald-500/40",
              t.tone === "error" && "border-red-500/40",
              t.tone === "info" && "border-cyan-500/40",
            )}
          >
            {t.tone === "success" ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-400" /> : null}
            {t.tone === "error" ? <CircleX className="h-4 w-4 shrink-0 text-red-400" /> : null}
            {t.tone === "info" ? <Info className="h-4 w-4 shrink-0 text-cyan-400" /> : null}
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-100">{t.title}</p>
              {t.body ? <p className="mt-0.5 break-words text-xs text-slate-400">{t.body}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
