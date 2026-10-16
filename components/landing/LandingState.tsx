'use client';

// Shared state for the two places the cultural-advisory toggle appears: the
// checkboxes in the live demo and the switch in the "Built to respect every
// tradition" section. They must stay in sync, exactly as in the original design:
//   · ticking any culture in the demo turns the advisory on
//   · flipping the switch ON ticks only the first culture; OFF clears them all

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export const CULTURES = ['Aboriginal Australian', 'Torres Strait Islander', 'South Sea Islander', 'Māori'] as const;

interface LandingStateValue {
  cultural: boolean[];
  advisoryOn: boolean;
  setCulture: (index: number, on: boolean) => void;
  setAdvisory: (on: boolean) => void;
}

const Ctx = createContext<LandingStateValue | null>(null);

export function LandingStateProvider({ children }: { children: ReactNode }) {
  const [cultural, setCultural] = useState<boolean[]>(() => CULTURES.map(() => false));

  const setCulture = useCallback((index: number, on: boolean) => {
    setCultural((prev) => prev.map((v, i) => (i === index ? on : v)));
  }, []);

  const setAdvisory = useCallback((on: boolean) => {
    setCultural(CULTURES.map((_, i) => on && i === 0));
  }, []);

  const value = useMemo(
    () => ({ cultural, advisoryOn: cultural.some(Boolean), setCulture, setAdvisory }),
    [cultural, setCulture, setAdvisory],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLandingState(): LandingStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLandingState must be used inside <LandingStateProvider>');
  return v;
}
