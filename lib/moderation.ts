// lib/moderation.ts
//
// What status does a public submission (guest-book entry or memory) start in?
//
// DEFAULT: PENDING. Anyone with the memorial's link can post, and the text
// appears on a grieving family's memorial page — nothing should be published
// to the public before a person has looked at it. (The schema default was
// already PENDING; the guest-book route used to override it to APPROVED, so
// abusive or spam text went live instantly. The staff moderation queue, the
// pending count on the dashboard and the approve/reject routes already
// existed and were simply unused for the guest book.)
//
// EXCEPTION — handed-over memorials: once a memorial is handed over, funeral
// -home staff no longer have access (lib/auth/getOrgForUser.ts), and the
// family's tools can HIDE a published entry but cannot approve a pending one.
// Holding submissions there would bury every message forever with nobody able
// to release them, so they publish immediately and the family can hide any
// they don't want (familyHidden).

export type PublicSubmissionStatus = 'PENDING' | 'APPROVED';

export function initialPublicStatus(workflowStage: string | null | undefined): PublicSubmissionStatus {
  return workflowStage === 'HANDED_OVER' ? 'APPROVED' : 'PENDING';
}
