// app/api/org/cases/csv-import/route.ts
//
// POST /api/org/cases/csv-import
//
// Accepts a multipart form with a single 'file' field containing a CSV.
// Parses rows, validates required fields, creates FuneralCase records,
// and — for every successfully-created case — immediately auto-creates
// its Memorial too, using the same logic as the manual "Create memorial
// from case" button (lib/memorial/createMemorial.ts). No further click
// required. A row that fails to become a case never gets a memorial;
// a case that succeeds but whose memorial creation fails (e.g. plan
// limit reached, or a name that doesn't split into first+last) still
// keeps its case — staff can create the memorial manually afterward.
//
// Returns: { created, skipped, errors, memorialsCreated, memorialErrors }
//
// Column names are case-insensitive and support common aliases:
//   case_ref / reference / ref / case_number
//   deceased_name / name / full_name / deceased
//   family_contact / contact / contact_name
//   contact_email / email
//   contact_phone / phone / mobile
//   service_date / date / funeral_date / service_datetime
//   venue / location / venue_name
//   notes / note / comments
//
// Duplicate caseRef within the org is skipped (not an error) — idempotent re-import.
// Auth: Clerk session + org membership + featureCaseLite.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser }            from '@/lib/tenant';
import { createMemorial }             from '@/lib/memorial/createMemorial';

// ── Column aliases ────────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string> = {
  // caseRef
  case_ref:     'caseRef',
  reference:    'caseRef',
  ref:          'caseRef',
  case_number:  'caseRef',
  casenumber:   'caseRef',
  case_no:      'caseRef',
  // deceasedName
  deceased_name:'deceasedName',
  name:         'deceasedName',
  full_name:    'deceasedName',
  fullname:     'deceasedName',
  deceased:     'deceasedName',
  // familyContact
  family_contact:'familyContact',
  contact:      'familyContact',
  contact_name: 'familyContact',
  contactname:  'familyContact',
  // contactEmail
  contact_email:'contactEmail',
  email:        'contactEmail',
  // contactPhone
  contact_phone:'contactPhone',
  phone:        'contactPhone',
  mobile:       'contactPhone',
  // serviceDate
  service_date: 'serviceDate',
  date:         'serviceDate',
  funeral_date: 'serviceDate',
  funeraldate:  'serviceDate',
  service_datetime: 'serviceDate',
  // venue
  venue:        'venue',
  location:     'venue',
  venue_name:   'venue',
  venuename:    'venue',
  // notes
  notes:        'notes',
  note:         'notes',
  comments:     'notes',
  comment:      'notes',
};

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

// ── CSV parser (no external dep — pure string parsing) ────────────────────────
// Handles quoted fields, commas inside quotes, CRLF and LF line endings.

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    if (!inQuotes && ch === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (!inQuotes && (ch === '\n' || (ch === '\r' && text[i + 1] === '\n'))) {
      row.push(cell);
      cell = '';
      lines.push(row);
      row = [];
      i += ch === '\r' ? 2 : 1;
      continue;
    }
    if (!inQuotes && ch === '\r') {
      row.push(cell);
      cell = '';
      lines.push(row);
      row = [];
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  // Last row
  if (cell || row.length) {
    row.push(cell);
    if (row.some(c => c.trim())) lines.push(row);
  }
  return lines;
}

// ── Date parsing — handles common AU date formats ─────────────────────────────

function parseDate(val: string): Date | null {
  if (!val.trim()) return null;
  const v = val.trim();

  // ISO: 2026-06-17 or 2026-06-17T10:00
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  // AU: 17/06/2026 or 17-06-2026
  const auMatch = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (auMatch) {
    const d = new Date(`${auMatch[3]}-${auMatch[2].padStart(2,'0')}-${auMatch[1].padStart(2,'0')}`);
    return isNaN(d.getTime()) ? null : d;
  }
  // Natural: "17 June 2026", "June 17 2026"
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const orgId = await getOrgIdForUser(userId);
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organisation' }, { status: 403 });
    }

    const org = await prisma.organisation.findUnique({
      where:  { id: orgId },
      select: { featureCaseLite: true },
    });
    if (!org?.featureCaseLite) {
      return NextResponse.json(
        { success: false, error: 'Case Lite feature is not enabled.' },
        { status: 403 },
      );
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      return NextResponse.json({ success: false, error: 'File must be a CSV' }, { status: 400 });
    }
    if (file.size > 500 * 1024) {
      return NextResponse.json({ success: false, error: 'CSV must be under 500 KB' }, { status: 400 });
    }

    const text  = await file.text();
    const rows  = parseCSV(text);
    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: 'CSV must have a header row and at least one data row' }, { status: 400 });
    }

    // Map headers → field names
    const headers  = rows[0].map(h => COL_ALIASES[normaliseHeader(h)] ?? normaliseHeader(h));
    const dataRows = rows.slice(1).filter(r => r.some(c => c.trim()));

    if (dataRows.length > 500) {
      return NextResponse.json({ success: false, error: 'Maximum 500 rows per import' }, { status: 400 });
    }

    // Fetch existing case refs for this org (for duplicate detection)
    const existingRefs = new Set(
      (await prisma.funeralCase.findMany({
        where:  { organisationId: orgId },
        select: { caseRef: true },
      })).map(c => c.caseRef),
    );

    const rowErrors: Array<{ row: number; error: string }> = [];
    const toCreate: Array<{
      organisationId: string;
      caseRef:        string;
      deceasedName:   string;
      familyContact:  string | null;
      contactEmail:   string | null;
      contactPhone:   string | null;
      serviceDate:    Date | null;
      venue:          string | null;
      notes:          string | null;
    }> = [];
    let skipped = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const rowNum = i + 2; // 1-indexed, +1 for header
      const row    = dataRows[i];

      // Build field map
      const fields: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (row[idx] !== undefined) fields[h] = row[idx].trim();
      });

      const caseRef     = fields['caseRef']?.trim();
      const deceasedName = fields['deceasedName']?.trim();

      if (!caseRef) {
        rowErrors.push({ row: rowNum, error: 'Missing case reference' });
        continue;
      }
      if (!deceasedName) {
        rowErrors.push({ row: rowNum, error: `Row ${rowNum}: Missing deceased name` });
        continue;
      }

      // Duplicate within this import batch
      if (toCreate.some(c => c.caseRef === caseRef)) {
        rowErrors.push({ row: rowNum, error: `Duplicate case reference "${caseRef}" in this file` });
        continue;
      }

      // Already exists in DB — skip silently (idempotent)
      if (existingRefs.has(caseRef)) {
        skipped++;
        continue;
      }

      // Parse service date
      let serviceDate: Date | null = null;
      if (fields['serviceDate']) {
        serviceDate = parseDate(fields['serviceDate']);
        if (!serviceDate) {
          rowErrors.push({ row: rowNum, error: `Row ${rowNum}: Could not parse service date "${fields['serviceDate']}"` });
          continue;
        }
      }

      toCreate.push({
        organisationId: orgId,
        caseRef,
        deceasedName,
        familyContact:  fields['familyContact']  || null,
        contactEmail:   fields['contactEmail']   || null,
        contactPhone:   fields['contactPhone']   || null,
        serviceDate,
        venue:          fields['venue']          || null,
        notes:          fields['notes']          || null,
      });
    }

    // Per-row create (not createMany) — needed so we get each case's real
    // id back immediately, to auto-create its memorial in the same pass.
    // Every successfully-created case gets a memorial with no further
    // click required, using the exact same creation logic as the manual
    // "Create memorial from case" button (lib/memorial/createMemorial.ts).
    let created = 0;
    let memorialsCreated = 0;
    const memorialErrors: Array<{ row: number; caseRef: string; error: string }> = [];

    for (const row of toCreate) {
      const funeralCase = await prisma.funeralCase.create({ data: row }).catch((e) => {
        rowErrors.push({ row: -1, error: `Failed to create case "${row.caseRef}": ${e instanceof Error ? e.message : 'unknown error'}` });
        return null;
      });
      if (!funeralCase) continue;
      created++;

      // Split "John Smith" → firstName="John", lastName="Smith", same
      // logic as components/memorial/PrefilledMemorialForm.tsx so a case
      // created via CSV and one created via the manual form behave
      // identically.
      const nameParts = funeralCase.deceasedName.trim().split(/\s+/);
      const firstName = nameParts[0] ?? '';
      const lastName  = nameParts.slice(1).join(' ');

      if (!firstName || !lastName) {
        memorialErrors.push({
          row: -1,
          caseRef: funeralCase.caseRef,
          error: `Deceased name "${funeralCase.deceasedName}" needs both a first and last name — memorial not auto-created, add manually from the case page`,
        });
        continue;
      }

      const result = await createMemorial({
        ownerId:            userId,
        organisationId:     orgId,
        firstName,
        lastName,
        funeralDate:        funeralCase.serviceDate ? funeralCase.serviceDate.toISOString().slice(0, 10) : undefined,
        familyContactName:  funeralCase.familyContact ?? undefined,
        familyContactEmail: funeralCase.contactEmail  ?? undefined,
        familyContactPhone: funeralCase.contactPhone  ?? undefined,
        venueName:          funeralCase.venue ?? undefined,
      });

      if (!result.ok) {
        // Case still exists and is usable — staff can retry memorial
        // creation manually from the case detail page. A failure here
        // (e.g. plan limit reached) should not undo the case import.
        memorialErrors.push({ row: -1, caseRef: funeralCase.caseRef, error: result.error });
        continue;
      }

      await prisma.funeralCase.update({
        where: { id: funeralCase.id },
        data:  { memorialId: result.memorial.id },
      });
      memorialsCreated++;
    }

    return NextResponse.json({
      success: true,
      data: {
        created,
        skipped,
        errors:           rowErrors,
        totalRows:        dataRows.length,
        memorialsCreated,
        memorialErrors,
      },
    });

  } catch (err: any) {
    console.error('[csv-import/POST]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
