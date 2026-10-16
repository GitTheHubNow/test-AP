'use client';

// "Set your price. Watch the margin move." — two sliders, live profit figure and a
// 12-bar cumulative chart. All maths lives in lib/landing/pricing (unit-tested).

import { useState } from 'react';
import {
  CASES_DEFAULT, CASES_MAX, CASES_MIN, RETAIL_DEFAULT, RETAIL_MAX, RETAIL_MIN, RETAIL_STEP,
  SUBSCRIPTION, clamp, formatUsd, marginPerMemorial, yearlyProfit,
} from '@/lib/landing/pricing';

export function MarginCalculator() {
  const [cases, setCases] = useState(CASES_DEFAULT);
  const [retail, setRetail] = useState(RETAIL_DEFAULT);

  return (
    <div className="calc rv">
      <div>
        <div className="r"><span>Memorials per month</span><b>{cases}</b></div>
        <input type="range" min={CASES_MIN} max={CASES_MAX} value={cases} aria-label="Memorials per month"
          onChange={(e) => setCases(clamp(Number(e.target.value), CASES_MIN, CASES_MAX))} />
        <div className="r"><span>Your retail price</span><b>{formatUsd(retail)}</b></div>
        <input type="range" min={RETAIL_MIN} max={RETAIL_MAX} step={RETAIL_STEP} value={retail} aria-label="Retail price"
          onChange={(e) => setRetail(clamp(Number(e.target.value), RETAIL_MIN, RETAIL_MAX))} />
        <div className="r"><span>Margin per memorial</span><b>{formatUsd(marginPerMemorial(retail))}</b></div>
      </div>
      <div>
        <div style={{ color: 'var(--mut)', fontSize: 14 }}>Net profit per year</div>
        <div className="big-n" aria-live="polite">{formatUsd(yearlyProfit(cases, retail))}</div>
        <div className="bars" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ height: `${Math.max(4, ((i + 1) / 12) * 100)}%` }} />)}
        </div>
        <p className="note">After your ${SUBSCRIPTION} monthly subscription, with the first month free. Bars show the next 12 months of cumulative profit.</p>
      </div>
    </div>
  );
}
