// components/pet-cases/petCaseUtils.ts
//
// Shared constants for pet case stage/status display.
// Imported by PetCaseList and PetCaseDetail.
//
// Re-exports formatDate/formatDateTime/memDisplayName from caseUtils.ts
// rather than duplicating them — those are genuinely shared, generic
// helpers with no human-case-specific assumptions baked in. Only the
// stage-specific lookups (which don't exist on the human side at all)
// live here.

export { STATUS_LABELS, STATUS_COLORS, formatDate, formatDateTime, memDisplayName } from '@/components/cases/caseUtils';
export type { CaseStatus } from '@/components/cases/caseUtils';

export type PetCaseStage = 'INTAKE' | 'RECEIVED' | 'IN_CARE' | 'READY' | 'RETURNED';

export const STAGE_ORDER: PetCaseStage[] = ['INTAKE', 'RECEIVED', 'IN_CARE', 'READY', 'RETURNED'];

export const STAGE_LABELS: Record<PetCaseStage, string> = {
  INTAKE:   'Intake',
  RECEIVED: 'Collected',
  IN_CARE:  'In care',
  READY:    'Ready',
  RETURNED: 'Returned',
};

export const STAGE_COLORS: Record<PetCaseStage, { bg: string; text: string; border: string }> = {
  INTAKE:   { bg: '#f7f5f2', text: 'rgba(10,10,22,0.5)', border: 'rgba(10,10,22,0.15)' },
  RECEIVED: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  IN_CARE:  { bg: '#fefce8', text: '#a16207', border: '#fde68a' },
  READY:    { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  RETURNED: { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
};

export const INTAKE_SOURCE_LABELS: Record<'VET' | 'OWNER' | 'WALK_IN', string> = {
  VET:      'Vet referral',
  OWNER:    'Owner',
  WALK_IN:  'Walk-in',
};

export function nextStage(current: PetCaseStage): PetCaseStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  return idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
}

export function prevStage(current: PetCaseStage): PetCaseStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  return idx > 0 ? STAGE_ORDER[idx - 1] : null;
}

export function petDisplayName(p: { petName: string; species?: string | null }): string {
  return p.species ? `${p.petName} (${p.species})` : p.petName;
}
