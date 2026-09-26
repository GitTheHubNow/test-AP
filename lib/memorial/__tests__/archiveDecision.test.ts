import { describe, it, expect } from 'vitest';
import { decideArchiveAction } from '@/lib/memorial/archiveDecision';

describe('decideArchiveAction', () => {
  it('rejects archiving a sealed memorial, regardless of its status', () => {
    const result = decideArchiveAction({ sealed: true, status: 'ACTIVE' });
    expect(result.action).toBe('reject');
    if (result.action === 'reject') {
      expect(result.status).toBe(409);
      expect(result.reason).toContain('sealed');
    }
  });

  it('rejects a sealed memorial even if it is also already archived', () => {
    // Sealed must win over "already archived" — a sealed record's
    // frozen status shouldn't be reported as a normal no-op success.
    const result = decideArchiveAction({ sealed: true, status: 'ARCHIVED' });
    expect(result.action).toBe('reject');
  });

  it('treats an already-archived, unsealed memorial as a no-op success', () => {
    const result = decideArchiveAction({ sealed: false, status: 'ARCHIVED' });
    expect(result.action).toBe('noop');
  });

  it('allows archiving an active, unsealed memorial', () => {
    const result = decideArchiveAction({ sealed: false, status: 'ACTIVE' });
    expect(result.action).toBe('archive');
  });

  it('allows archiving a suspended, unsealed memorial', () => {
    // SUSPENDED is a real MemorialStatus value distinct from ACTIVE —
    // the rule should not accidentally only handle the ACTIVE case.
    const result = decideArchiveAction({ sealed: false, status: 'SUSPENDED' });
    expect(result.action).toBe('archive');
  });
});
