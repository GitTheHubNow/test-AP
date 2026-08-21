// lib/htmlEscape.ts
//
// Escapes user-supplied text before interpolating it into HTML email
// templates (lib/email-templates/*.ts). Those templates build HTML via
// plain template literals — e.g. `${h1(`In Loving Memory of
// ${memorialTitle}`)}` — and memorialTitle/familyName/ownerName/etc.
// all ultimately come from free-text fields a funeral home or family
// member typed in (Memorial.title, Memorial.nominatedName, and
// similar). None of that was being escaped anywhere in the pipeline,
// so a memorial titled e.g. `<img src=x onerror=alert(1)>` would have
// its markup interpreted as-is by any recipient's email client that
// renders HTML permissively — a real stored-XSS-via-email vector, not
// a theoretical one.
//
// This does NOT touch the hand-written HTML structure inside the
// templates themselves (the <strong> tags, table markup, etc.) — only
// wrap the *variable* values with this before they go into a template
// literal. Escaping the whole assembled string would break the
// intentional markup the templates rely on.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
