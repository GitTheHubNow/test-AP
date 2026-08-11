// types/v2.ts
//
// Shared TypeScript types for V2 features.
// All types derived directly from schema.prisma Phase 17 fields.
// Do not duplicate types already defined in Prisma client — use these
// only for API response shapes and component props.

// ── QR Lifecycle ──────────────────────────────────────────────────────────────

export type QRState =
  | 'PRE_SERVICE'
  | 'SERVICE_ACTIVE'
  | 'UNLOCK_PENDING'
  | 'MEMORIAL_OPEN'
  | 'PRIVATE'
  | 'ARCHIVED';

export const QR_STATES: QRState[] = [
  'PRE_SERVICE',
  'SERVICE_ACTIVE',
  'UNLOCK_PENDING',
  'MEMORIAL_OPEN',
  'PRIVATE',
  'ARCHIVED',
];

export function isValidQRState(s: string): s is QRState {
  return (QR_STATES as string[]).includes(s);
}

// ── Theme / White Label ───────────────────────────────────────────────────────

export interface ResolvedTheme {
  brandName:        string;
  logoUrl:          string | null;
  primaryColor:     string;
  secondaryColor:   string;
  supportEmail:     string | null;
  poweredByEnabled: boolean;
  isWhiteLabel:     boolean;
}

// ── Memorial public data (used by /v/[publicToken] pages) ─────────────────────

export interface MemorialPublicData {
  id:             string;
  firstName:      string | null;
  lastName:       string | null;
  preferredName:  string | null;
  birthDate:      Date | null;
  deathDate:      Date | null;
  description:    string | null;

  // V1 public URL hash — used to construct /m/[qrTokenHash] links.
  // Required so MemorialOpenView can link out to the V1 memorial page.
  qrTokenHash:    string;

  // Phase 17 QR lifecycle
  publicToken:    string;
  qrState:        QRState;
  serviceStartAt: Date | null;
  unlockAt:       Date | null;

  // Phase 17 pamphlet
  pamphletEnabled:   boolean;
  pamphletTitle:     string | null;
  pamphletMessage:   string | null;
  pamphletVenueNote: string | null;

  // V1 service fields — reused by PamphletView
  serviceType:    string | null;
  serviceTime:    Date | null;
  funeralDate:    Date | null;
  venueName:      string | null;
  venueAddress:   string | null;

  // Status
  status:         string;
  readOnly:       boolean;
  sealed:         boolean;
  organisationId: string | null;
}

// ── Product Requests ──────────────────────────────────────────────────────────

export type ProductRequestStatus =
  | 'REQUESTED'
  | 'QUOTED'
  | 'APPROVED'
  | 'FULFILLED'
  | 'CANCELLED';

export type ProductType = 'plaque' | 'card' | 'print' | 'keepsake' | 'other';

export const VALID_PRODUCT_TYPES: ProductType[] = [
  'plaque', 'card', 'print', 'keepsake', 'other',
];

export interface CreateProductRequestBody {
  productType:     ProductType;
  quantity?:       number;
  specifications?: Record<string, unknown>;
  requestNotes?:   string;
}

// ── QR Config Update (body for PUT /api/memorials/[id]/qr) ───────────────────

export interface QRConfigUpdate {
  qrState?:          QRState;
  serviceStartAt?:   string;   // ISO 8601
  unlockAt?:         string;   // ISO 8601
  pamphletEnabled?:  boolean;
  pamphletTitle?:    string;
  pamphletVenueNote?: string;
  pamphletMessage?:  string;
}

// ── API response wrapper ──────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data:  T;
  error: null;
}

export interface ApiError {
  data:    null;
  error:   string;
  status?: number;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;
