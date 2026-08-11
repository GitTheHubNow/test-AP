/**
 * StaleBadge
 *
 * Small inline badge shown next to pending memories that have been
 * waiting for review for more than 30 days.
 *
 * Use alongside the existing ModerationList — check memory.stale
 * and render this badge next to the author name or date.
 *
 * Phase 10
 */
export function StaleBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
      title="This memory has been pending for more than 30 days"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Awaiting 30d+
    </span>
  );
}
