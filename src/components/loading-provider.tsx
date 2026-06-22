"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

type LoadingContextValue = {
  isLoading: boolean;
  run: <T>(fn: () => Promise<T>) => Promise<T>;
};

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [activeCount, setActiveCount] = useState(0);
  const countRef = useRef(0);

  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    countRef.current += 1;
    setActiveCount(countRef.current);
    try {
      return await fn();
    } finally {
      countRef.current = Math.max(0, countRef.current - 1);
      setActiveCount(countRef.current);
    }
  }, []);

  return (
    <LoadingContext.Provider value={{ isLoading: activeCount > 0, run }}>
      {children}
      {activeCount > 0 && <LoadingOverlay />}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) {
    return {
      isLoading: false,
      run: async <T,>(fn: () => Promise<T>) => fn(),
    };
  }
  return ctx;
}

function LoadingOverlay() {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/25 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-10 py-8 shadow-xl">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-emerald-600" />
        </div>
        <p className="text-sm font-medium text-slate-700">Please wait…</p>
      </div>
    </div>
  );
}
