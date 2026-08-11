// lib/products/transitions.ts
//
// Pure state machine for ProductRequest status transitions.
// No Prisma imports — import this anywhere without side effects.
//
// Valid flow:
//   REQUESTED → QUOTED      (quotedPrice required)
//   REQUESTED → CANCELLED
//   QUOTED    → APPROVED
//   QUOTED    → CANCELLED
//   APPROVED  → FULFILLED   (completedAt set)
//   APPROVED  → CANCELLED
//   FULFILLED → (terminal)
//   CANCELLED → (terminal)

export type ProductRequestStatus =
  | 'REQUESTED'
  | 'QUOTED'
  | 'APPROVED'
  | 'FULFILLED'
  | 'CANCELLED';

export const VALID_PRODUCT_TYPES = [
  'plaque',
  'card',
  'print',
  'keepsake',
  'other',
] as const;

export type ProductType = typeof VALID_PRODUCT_TYPES[number];

// Adjacency map — only listed transitions are legal.
const TRANSITIONS: Record<ProductRequestStatus, ProductRequestStatus[]> = {
  REQUESTED: ['QUOTED', 'CANCELLED'],
  QUOTED:    ['APPROVED', 'CANCELLED'],
  APPROVED:  ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  CANCELLED: [],
};

export function isValidTransition(
  from: ProductRequestStatus,
  to: ProductRequestStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: ProductRequestStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * Returns the Prisma update payload for a status transition.
 * Sets the appropriate timestamp field automatically.
 * Throws if the transition is invalid.
 */
export function applyTransition(
  from: ProductRequestStatus,
  to:   ProductRequestStatus,
  extra: { quotedPrice?: number } = {},
): Record<string, unknown> {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }

  const now = new Date();
  const update: Record<string, unknown> = { status: to };

  switch (to) {
    case 'QUOTED':
      update.quotedAt = now;
      if (extra.quotedPrice !== undefined) {
        update.quotedPrice = extra.quotedPrice;
      }
      break;
    case 'APPROVED':
      update.approvedAt = now;
      break;
    case 'FULFILLED':
      update.completedAt = now;
      break;
    case 'CANCELLED':
      // No extra timestamp field in schema for cancellation —
      // requestedAt already records creation; cancelled is implied by status.
      break;
  }

  return update;
}

/** Human-readable label for each status (used in UI). */
export const STATUS_LABELS: Record<ProductRequestStatus, string> = {
  REQUESTED: 'Requested',
  QUOTED:    'Quoted',
  APPROVED:  'Approved',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
};

/** Tailwind-compatible colour tokens for each status badge. */
export const STATUS_COLORS: Record<
  ProductRequestStatus,
  { bg: string; text: string; border: string }
> = {
  REQUESTED: { bg: '#fef9ec', text: '#92620a', border: '#f6d860' },
  QUOTED:    { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  APPROVED:  { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  FULFILLED: { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  CANCELLED: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
};

/** Available next statuses from a given current status. */
export function availableTransitions(
  from: ProductRequestStatus,
): ProductRequestStatus[] {
  return TRANSITIONS[from] ?? [];
}
