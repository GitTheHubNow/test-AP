// components/onboarding/OnboardingSteps.tsx
//
// Shared labelled step indicator for the guided onboarding flow
// (app/onboarding/page.tsx → app/onboarding/payment/page.tsx).
//
// Replaces the old plain-dot indicator with named steps so a funeral
// home team member always knows both where they are and what's left,
// e.g. "Organisation ● ── ○ Payment" rather than just two dots.

const STEPS = ['Organisation', 'Payment'] as const;

export function OnboardingSteps({ current }: { current: 1 | 2 }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.6rem',
        marginBottom: '2rem',
      }}
    >
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;

        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  background: isDone ? '#cdba93' : isActive ? 'rgba(205,186,147,0.15)' : 'transparent',
                  border: isActive ? '1.5px solid #cdba93' : '1.5px solid #5c6a80',
                  color: isDone ? '#4f5d75' : isActive ? '#cdba93' : '#7c8aa0',
                  flexShrink: 0,
                }}
              >
                {isDone ? '✓' : stepNum}
              </div>
              <span
                style={{
                  fontSize: '0.78rem',
                  letterSpacing: '0.02em',
                  color: isActive ? '#f4f1ea' : isDone ? '#cdba93' : '#7c8aa0',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </div>

            {stepNum < STEPS.length && (
              <div
                style={{
                  width: 28,
                  height: 1,
                  background: isDone ? '#cdba93' : '#5c6a80',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
