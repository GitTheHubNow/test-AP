// components/journey/MemorialJourney.tsx
//
// Server component — a plain-language "where are we up to" tracker for
// funeral home staff. Not a new state machine: it reads the SAME data
// that already drives the app (Memorial.qrState / serviceStartAt /
// unlockAt from lib/qr/lifecycle.ts, and Memorial.workflowStage from
// the handover flow) and turns it into a five-step story:
//
//   1. Send the QR code       — publicToken exists / has been generated
//   2. Waiting period         — PRE_SERVICE / SERVICE_ACTIVE / UNLOCK_PENDING,
//                                 shows the unlock date if one is set
//   3. Review what's been shared — count of PENDING memories awaiting approval
//   4. Publish the memorial   — workflowStage reaches LIVE
//   5. Hand over to the family — workflowStage reaches HANDED_OVER
//
// Deliberately read-only and presentational — actions ("Approve now",
// "Adjust unlock date") link out to the existing moderation / lifecycle
// panel / handover pages rather than duplicating their logic here.

import Link from 'next/link';
import type { QRState } from '@/types/v2';

export interface MemorialJourneyProps {
  memorialId:     string;
  qrGenerated:    boolean;
  qrState:        QRState;
  serviceStartAt: Date | null;
  unlockAt:       Date | null;
  pendingCount:   number;
  workflowStage:  string;
}

type StepStatus = 'done' | 'active' | 'upcoming';

interface Step {
  key:     string;
  title:   string;
  detail:  string;
  status:  StepStatus;
  href?:   string;
  linkLabel?: string;
}

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

function buildSteps(props: MemorialJourneyProps): Step[] {
  const { memorialId, qrGenerated, qrState, unlockAt, pendingCount, workflowStage } = props;

  const isWaiting  = qrState === 'PRE_SERVICE' || qrState === 'SERVICE_ACTIVE' || qrState === 'UNLOCK_PENDING';
  const isOpen     = qrState === 'MEMORIAL_OPEN' || qrState === 'ARCHIVED';
  const isLive     = workflowStage === 'LIVE' || workflowStage === 'HANDED_OVER';
  const isHandedOver = workflowStage === 'HANDED_OVER';

  const unlockText = fmtDate(unlockAt);

  const steps: Step[] = [
    {
      key:    'send',
      title:  'Send the QR code',
      detail: qrGenerated
        ? 'Generated and ready — print it or share the link with the family and venue.'
        : 'Print or share the permanent QR code for the service.',
      status: qrGenerated ? 'done' : 'active',
      href:   `/dashboard/memorial/${memorialId}/qr`,
      linkLabel: 'Get the QR code',
    },
    {
      key:    'wait',
      title:  'Waiting period',
      detail: isWaiting
        ? (unlockText
            ? `Showing the service pamphlet until it unlocks on ${unlockText}.`
            : 'Showing the service pamphlet. Set an unlock date to automate this.')
        : isOpen
          ? 'Unlock period complete — the memorial is visible.'
          : 'Set a service date and unlock delay once the QR is out.',
      status: isOpen ? 'done' : qrGenerated ? 'active' : 'upcoming',
      href:   `/dashboard/memorial/${memorialId}/qr`,
      linkLabel: 'Adjust unlock date',
    },
    {
      key:    'review',
      title:  'Review what families share',
      detail: pendingCount > 0
        ? `${pendingCount} photo${pendingCount === 1 ? '' : 's'}/memor${pendingCount === 1 ? 'y' : 'ies'} waiting for your approval.`
        : 'Nothing waiting right now — new submissions land here for approval.',
      status: pendingCount > 0 ? 'active' : (isLive ? 'done' : 'upcoming'),
      href:   `/dashboard/memorial/${memorialId}/moderation`,
      linkLabel: pendingCount > 0 ? `Review ${pendingCount} now` : 'Open review queue',
    },
    {
      key:    'publish',
      title:  'Publish the memorial',
      detail: isLive
        ? 'Live and visible to family and friends.'
        : 'Once you\u2019re happy with the content, publish it live.',
      status: isLive ? 'done' : (isOpen ? 'active' : 'upcoming'),
      href:   `/dashboard/memorial/${memorialId}/preview`,
      linkLabel: isLive ? 'View live page' : 'Preview & publish',
    },
    {
      key:    'handover',
      title:  'Hand over to the family',
      detail: isHandedOver
        ? 'The family now manages this memorial directly.'
        : 'When you\u2019re ready, hand ongoing ownership to the family.',
      status: isHandedOver ? 'done' : (isLive ? 'active' : 'upcoming'),
      href:   `/dashboard/memorial/${memorialId}/handover`,
      linkLabel: 'Start handover',
    },
  ];

  return steps;
}

export function MemorialJourney(props: MemorialJourneyProps) {
  const steps = buildSteps(props);

  return (
    <div
      style={{
        maxWidth: 900,
        margin: '0 auto 2.5rem',
        background: '#fffdf7',
        border: '1px solid #e8dcc8',
        borderRadius: 12,
        padding: '1.75rem 1.75rem 1.25rem',
      }}
    >
      <p
        style={{
          margin: '0 0 0.2rem',
          fontSize: '0.62rem',
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: '#9c7c50',
          fontWeight: 600,
        }}
      >
        Memorial Journey
      </p>
      <h2
        style={{
          margin: '0 0 1.5rem',
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: '1.35rem',
          fontWeight: 600,
          color: '#1a0e05',
        }}
      >
        Where this memorial is up to
      </h2>

      <div>
        {steps.map((step, i) => (
          <div
            key={step.key}
            style={{
              display: 'flex',
              gap: '1rem',
              paddingBottom: i < steps.length - 1 ? '1.1rem' : 0,
              position: 'relative',
            }}
          >
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  left: 13,
                  top: 30,
                  bottom: 0,
                  width: 2,
                  background: step.status === 'done' ? '#cdba93' : '#e8dcc8',
                }}
              />
            )}

            {/* Marker */}
            <div
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 700,
                zIndex: 1,
                background:
                  step.status === 'done'    ? '#cdba93' :
                  step.status === 'active'  ? '#fff' : '#f4f1ea',
                border:
                  step.status === 'active'  ? '2px solid #cdba93' :
                  step.status === 'done'    ? '2px solid #cdba93' : '2px solid #e0d5c0',
                color:
                  step.status === 'done'    ? '#1a0e05' :
                  step.status === 'active'  ? '#9c7c50' : '#c4b49a',
              }}
            >
              {step.status === 'done' ? '✓' : i + 1}
            </div>

            {/* Content */}
            <div style={{ paddingTop: '0.05rem', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    color: step.status === 'upcoming' ? '#b8a080' : '#1a0e05',
                    fontFamily: "'Cormorant Garamond', serif",
                  }}
                >
                  {step.title}
                </h3>
                {step.status === 'active' && (
                  <span
                    style={{
                      fontSize: '0.58rem',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#9c7c50',
                      background: '#f7ecd8',
                      border: '1px solid #e8dcc8',
                      borderRadius: 4,
                      padding: '0.1rem 0.4rem',
                      fontWeight: 600,
                    }}
                  >
                    Up to here
                  </span>
                )}
              </div>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.78rem',
                  color: step.status === 'upcoming' ? '#c4b49a' : '#7a6a52',
                  lineHeight: 1.5,
                }}
              >
                {step.detail}
              </p>
              {step.href && step.status !== 'upcoming' && (
                <Link
                  href={step.href}
                  style={{
                    display: 'inline-block',
                    marginTop: '0.4rem',
                    fontSize: '0.74rem',
                    color: '#9c7c50',
                    fontWeight: 600,
                    textDecoration: 'none',
                    borderBottom: '1px solid #cdba93',
                  }}
                >
                  {step.linkLabel} →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
