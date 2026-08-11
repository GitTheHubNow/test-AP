// lib/errors.ts
//
// Centralised error helpers for API routes.
//
// EXISTING exports (used by V1 routes — DO NOT CHANGE SIGNATURES):
//   CommonErrors, successResponse, logError, handlePrismaError
//
// successResponse returns flat data (not wrapped in { data, error }).
// This matches the contract expected by all V1 pages e.g. memorials-page.tsx
// which reads d.memorials directly, not d.data.memorials.
//
// NEW exports (V2 only — additive):
//   logInfo, handleAuthError, withErrorHandling

import { NextRequest } from 'next/server';

// ── Standard responses (V1 — unchanged) ──────────────────────────────────────

export const CommonErrors = {
  unauthorized: () =>
    Response.json({ error: 'Unauthorized' }, { status: 401 }),

  forbidden: (message = 'Forbidden') =>
    Response.json({ error: message }, { status: 403 }),

  notFound: (resource = 'Resource') =>
    Response.json({ error: `${resource} not found` }, { status: 404 }),

  badRequest: (message: string) =>
    Response.json({ error: message }, { status: 400 }),

  internal: (message = 'Internal server error') =>
    Response.json({ error: message }, { status: 500 }),

  featureDisabled: (feature: string) =>
    Response.json(
      { error: `Feature '${feature}' is not enabled for your organisation` },
      { status: 403 },
    ),
};

// IMPORTANT: Returns flat data — matches V1 page contract.
// memorials-page.tsx reads d.memorials (not d.data.memorials).
// Do NOT change this to wrap in { data, error }.
export function successResponse<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

// ── Logging ───────────────────────────────────────────────────────────────────

export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack   = error instanceof Error ? error.stack   : undefined;
  console.error(
    JSON.stringify({
      level:     'ERROR',
      context,
      message,
      stack,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function logInfo(
  context: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      level:     'INFO',
      context,
      message,
      ...meta,
      timestamp: new Date().toISOString(),
    }),
  );
}

// ── Prisma error handler (V1 — unchanged) ─────────────────────────────────────

export function handlePrismaError(error: unknown): Response {
  const e = error as { code?: string };
  switch (e.code) {
    case 'P2002':
      return CommonErrors.badRequest('A record with this value already exists');
    case 'P2025':
      return CommonErrors.notFound();
    case 'P2003':
      return CommonErrors.badRequest('Related record not found');
    case 'P2014':
      return CommonErrors.badRequest('Required relation missing');
    default:
      logError('prisma', error);
      return CommonErrors.internal();
  }
}

// ── Auth error handler (V2 addition) ─────────────────────────────────────────

export function handleAuthError(err: unknown): Response {
  const status  = (err as any)?.status ?? 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (status === 401) return CommonErrors.unauthorized();
  if (status === 403) return CommonErrors.forbidden(message);
  if (status === 404) return CommonErrors.notFound(message);
  if (status === 400) return CommonErrors.badRequest(message);
  logError('auth', err);
  return CommonErrors.internal();
}

// ── Route wrapper (V2 addition) ───────────────────────────────────────────────

type RouteHandler<TParams = Record<string, string>> = (
  req: NextRequest,
  ctx: { params: TParams },
) => Promise<Response>;

// Generic over TParams so a route's actual params shape (e.g. { id: string })
// flows through instead of being widened to Record<string, string>, which
// doesn't structurally satisfy Next's generated per-route handler types.
export function withErrorHandling<TParams = Record<string, string>>(
  handler: RouteHandler<TParams>,
): RouteHandler<TParams> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const status = (err as any)?.status;
      if (status === 401) return CommonErrors.unauthorized();
      if (status === 403) return CommonErrors.forbidden(
        err instanceof Error ? err.message : 'Forbidden',
      );
      if (status === 404) return CommonErrors.notFound(
        err instanceof Error ? err.message : 'Not found',
      );
      if (status === 400) return CommonErrors.badRequest(
        err instanceof Error ? err.message : 'Bad request',
      );
      if (err && typeof err === 'object' && 'code' in err) {
        return handlePrismaError(err);
      }
      logError(req.url, err);
      return CommonErrors.internal();
    }
  };
}
