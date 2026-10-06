// lib/memorial/validateAppearanceSettings.ts
//
// Shared input validation for MemorialSettings writes. Two routes write to
// this exact table with the exact same fields —
// app/api/memorial/[memorialId]/appearance/route.ts and
// app/api/memorial/[memorialId]/settings/appearance/route.ts (the latter's
// own file header already flags the duplication as a known, unaddressed
// issue) — and they'd drifted: one validated hex colors and nothing else,
// the other validated nothing at all. Neither capped text field length or
// restricted theme/heroLayout/fontFamily to the values the UI actually
// offers.
//
// Real-world impact of the gap this closes: every value here is rendered
// either via a React style={{}} object (which sets a DOM property
// directly, not raw CSS text — a malicious string can't break out of it)
// or plain JSX {text} interpolation (React escapes this automatically).
// Traced every render site before writing this — found none that
// interpolate these fields into dangerouslySetInnerHTML or a raw CSS/HTML
// string. So this was not an active, exploitable XSS. It's still worth
// closing: unbounded text fields are an easy DoS surface, an unrestricted
// fontFamily/theme/heroLayout lets a staff account write junk values that
// silently fall through to a default somewhere, and "we checked every
// current render site" is not a guarantee that stays true as the app
// grows — validating at the boundary means a future render site doesn't
// inherit this as a live risk by default.

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

// Exact value sets from components/memorial/AppearanceEditor.tsx's own
// type definitions (THEMES/HERO_LAYOUTS/FONTS) — these are the only
// values the real UI ever sends.
const THEMES       = ['light', 'warm', 'slate', 'dark'] as const;
const HERO_LAYOUTS = ['full-bleed', 'portrait', 'minimal'] as const;
const FONT_FAMILIES = ['serif', 'sans', 'elegant'] as const;

const MAX_GUESTBOOK_TITLE_LEN  = 100;
const MAX_GUESTBOOK_PROMPT_LEN = 300;

export interface AppearanceSettingsInput {
  theme?:           unknown;
  heroLayout?:       unknown;
  fontFamily?:       unknown;
  primaryColor?:     unknown;
  backgroundColor?:  unknown;
  showTimeline?:     unknown;
  showGallery?:      unknown;
  showGuestBook?:    unknown;
  showMemoryCount?:  unknown;
  guestBookTitle?:   unknown;
  guestBookPrompt?:  unknown;
}

export interface ValidatedAppearanceSettings {
  theme?:           typeof THEMES[number];
  heroLayout?:       typeof HERO_LAYOUTS[number];
  fontFamily?:       typeof FONT_FAMILIES[number] | null;
  primaryColor?:     string | null;
  backgroundColor?:  string | null;
  showTimeline?:     boolean;
  showGallery?:      boolean;
  showGuestBook?:    boolean;
  showMemoryCount?:  boolean;
  guestBookTitle?:   string | null;
  guestBookPrompt?:  string | null;
}

/**
 * Validates a MemorialSettings PATCH body. Returns either the cleaned
 * data (only the fields that were actually present in the input, same
 * "undefined means don't touch it" convention both routes already use)
 * or a single error message naming the first invalid field — intentionally
 * not a full list of every error, since the client re-submits one field
 * at a time via the appearance editor's auto-save and a single clear
 * message is enough to act on.
 */
export function validateAppearanceSettings(
  body: AppearanceSettingsInput,
): { ok: true; data: ValidatedAppearanceSettings } | { ok: false; error: string } {
  const data: ValidatedAppearanceSettings = {};

  if (body.theme !== undefined) {
    if (typeof body.theme !== 'string' || !isOneOf(body.theme, THEMES)) {
      return { ok: false, error: `theme must be one of: ${THEMES.join(', ')}` };
    }
    data.theme = body.theme;
  }

  if (body.heroLayout !== undefined) {
    if (typeof body.heroLayout !== 'string' || !isOneOf(body.heroLayout, HERO_LAYOUTS)) {
      return { ok: false, error: `heroLayout must be one of: ${HERO_LAYOUTS.join(', ')}` };
    }
    data.heroLayout = body.heroLayout;
  }

  if (body.fontFamily !== undefined) {
    if (body.fontFamily === null) {
      data.fontFamily = null;
    } else if (typeof body.fontFamily !== 'string' || !isOneOf(body.fontFamily, FONT_FAMILIES)) {
      return { ok: false, error: `fontFamily must be one of: ${FONT_FAMILIES.join(', ')}` };
    } else {
      data.fontFamily = body.fontFamily;
    }
  }

  if (body.primaryColor !== undefined) {
    if (body.primaryColor === null) {
      data.primaryColor = null;
    } else if (typeof body.primaryColor !== 'string' || !HEX_COLOR_RE.test(body.primaryColor)) {
      return { ok: false, error: 'primaryColor must be a hex colour like #a1b2c3' };
    } else {
      data.primaryColor = body.primaryColor;
    }
  }

  if (body.backgroundColor !== undefined) {
    if (body.backgroundColor === null) {
      data.backgroundColor = null;
    } else if (typeof body.backgroundColor !== 'string' || !HEX_COLOR_RE.test(body.backgroundColor)) {
      return { ok: false, error: 'backgroundColor must be a hex colour like #a1b2c3' };
    } else {
      data.backgroundColor = body.backgroundColor;
    }
  }

  for (const key of ['showTimeline', 'showGallery', 'showGuestBook', 'showMemoryCount'] as const) {
    const value = body[key];
    if (value !== undefined) {
      if (typeof value !== 'boolean') {
        return { ok: false, error: `${key} must be true or false` };
      }
      data[key] = value;
    }
  }

  if (body.guestBookTitle !== undefined) {
    if (body.guestBookTitle === null) {
      data.guestBookTitle = null;
    } else if (typeof body.guestBookTitle !== 'string') {
      return { ok: false, error: 'guestBookTitle must be a string' };
    } else if (body.guestBookTitle.length > MAX_GUESTBOOK_TITLE_LEN) {
      return { ok: false, error: `guestBookTitle must be ${MAX_GUESTBOOK_TITLE_LEN} characters or fewer` };
    } else {
      data.guestBookTitle = body.guestBookTitle.trim() || null;
    }
  }

  if (body.guestBookPrompt !== undefined) {
    if (body.guestBookPrompt === null) {
      data.guestBookPrompt = null;
    } else if (typeof body.guestBookPrompt !== 'string') {
      return { ok: false, error: 'guestBookPrompt must be a string' };
    } else if (body.guestBookPrompt.length > MAX_GUESTBOOK_PROMPT_LEN) {
      return { ok: false, error: `guestBookPrompt must be ${MAX_GUESTBOOK_PROMPT_LEN} characters or fewer` };
    } else {
      data.guestBookPrompt = body.guestBookPrompt.trim() || null;
    }
  }

  return { ok: true, data };
}
