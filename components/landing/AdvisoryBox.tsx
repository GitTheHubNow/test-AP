'use client';

// The cultural-advisory switch in the "Built to respect every tradition" section.
// Shares its state with the checkboxes in the live demo (see LandingState).

import { useLandingState } from './LandingState';

export function AdvisoryBox() {
  const { advisoryOn, setAdvisory } = useLandingState();
  return (
    <div className="advbox rv">
      <div className="sw">
        <span>Advisory shown on memorial</span>
        <input type="checkbox" checked={advisoryOn} onChange={(e) => setAdvisory(e.target.checked)} aria-label="Toggle advisory"
          style={{ accentColor: 'var(--gold)', width: 18, height: 18 }} />
      </div>
      <p style={{ opacity: advisoryOn ? 1 : 0.35 }}>
        Aboriginal and Torres Strait Islander visitors are advised that this memorial contains images, voices and names of a deceased person.
      </p>
      <div className="sw">Enabled by the funeral home. The family can change this after handover.</div>
    </div>
  );
}
