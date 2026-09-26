// lib/memorial/resolveMemorialFields.ts
//
// Single source of truth resolution for fields that exist on BOTH
// Memorial and FuneralCase (deceasedName vs firstName/lastName,
// serviceDate vs funeralDate, familyContact/contactEmail vs
// nominatedName/nominatedEmail, venue vs venueName/venueAddress).
//
// IMPORTANT CONSTRAINT this whole design has to respect: not every
// Memorial has a linked FuneralCase — Memorial.funeralCase is
// nullable, and plenty of real memorials are created directly with no
// case involved at all (the V2 case→memorial flow is optional, not
// required). So this can never be "always trust the case" — it's
// "trust the case IF one is linked, otherwise trust the memorial's own
// columns, exactly as before."
//
// Once a memorial has a linked case, funeral-home staff should edit
// these fields on the CASE (via the case detail page), not on the
// memorial's own settings page — see the settings route change that
// accompanies this file, which locks these fields when case-linked
// rather than allowing two silently-diverging edit surfaces.
//
// This does NOT touch the database. It's a pure function: give it
// whatever your query already fetched (memorial fields + the linked
// case, if you selected it), get back the resolved values to actually
// display/use. Existing reads of memorial.firstName etc. still work
// unmodified on the DB side — this only changes what call sites should
// read from, not the schema.

export interface MemorialFieldSource {
  firstName:      string | null;
  lastName:       string | null;
  funeralDate:    Date | null;
  nominatedName:  string | null;
  nominatedEmail: string | null;
  venueName:      string | null;
  venueAddress:   string | null;
  funeralCase?: {
    deceasedName:  string;
    serviceDate:   Date | null;
    familyContact: string | null;
    contactEmail:  string | null;
    venueName:     string | null;
    venueAddress:  string | null;
  } | null;
}

export interface ResolvedMemorialFields {
  firstName:      string | null;
  lastName:       string | null;
  funeralDate:    Date | null;
  nominatedName:  string | null;
  nominatedEmail: string | null;
  venueName:      string | null;
  venueAddress:   string | null;
  /** True if any of the above came from the linked case rather than the memorial's own columns — use this to grey out / redirect edit UI to the case. */
  isCaseLinked: boolean;
}

/**
 * Splits a single "deceasedName" free-text field into first/last name,
 * on a best-effort basis: first word is firstName, remainder is
 * lastName. Matches the exact logic already used at case→memorial
 * creation time (see components/memorial/PrefilledMemorialForm.tsx) —
 * kept consistent so a case-linked memorial's name always splits the
 * same way whether it happened at creation or is resolved later here.
 */
function splitDeceasedName(deceasedName: string): { firstName: string; lastName: string } {
  const parts = deceasedName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? '',
    lastName:  parts.slice(1).join(' '),
  };
}

export function resolveMemorialFields(source: MemorialFieldSource): ResolvedMemorialFields {
  const fc = source.funeralCase;

  if (!fc) {
    // No linked case — memorial's own columns are the only source,
    // exactly as before this change.
    return {
      firstName:      source.firstName,
      lastName:       source.lastName,
      funeralDate:    source.funeralDate,
      nominatedName:  source.nominatedName,
      nominatedEmail: source.nominatedEmail,
      venueName:      source.venueName,
      venueAddress:   source.venueAddress,
      isCaseLinked:   false,
    };
  }

  const { firstName, lastName } = splitDeceasedName(fc.deceasedName);

  return {
    firstName,
    lastName,
    funeralDate:    fc.serviceDate,
    nominatedName:  fc.familyContact,
    nominatedEmail: fc.contactEmail,
    // Venue: case's own venueName/venueAddress once the schema upgrade
    // (splitting FuneralCase.venue) ships — see migration. Falls back
    // to the memorial's own venue fields if the case hasn't been
    // migrated to the split format yet (defensive; should not happen
    // post-migration, but avoids a hard crash on stale data).
    venueName:      fc.venueName    ?? source.venueName,
    venueAddress:   fc.venueAddress ?? source.venueAddress,
    isCaseLinked:   true,
  };
}
