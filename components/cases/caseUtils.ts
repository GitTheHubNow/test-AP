// components/cases/caseUtils.ts
//
// Shared constants for case status display.
// Imported by CaseList and CaseDetail.

export type CaseStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export const STATUS_LABELS: Record<CaseStatus, string> = {
  ACTIVE:    'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const STATUS_COLORS: Record<CaseStatus, { bg: string; text: string; border: string }> = {
  ACTIVE:    { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  COMPLETED: { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  CANCELLED: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
};

export function memDisplayName(m: {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
}): string {
  return (
    m.preferredName ||
    [m.firstName, m.lastName].filter(Boolean).join(' ') ||
    m.title ||
    'Memorial'
  );
}

export function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function formatDateTime(d: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
