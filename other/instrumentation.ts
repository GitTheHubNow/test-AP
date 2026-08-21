// instrumentation.ts
//
// Next.js runs this file's register() function once, automatically, when
// the server starts — before any request is handled. This is the correct
// place for boot-time checks, unlike relying on module import order
// (which is what lib/env.ts previously tried to do via a top-level
// side effect that, in practice, never ran because nothing imported it).
//
// Requires next.config.js to NOT have experimental.instrumentationHook
// set to false — it's on by default in Next.js 14+, so no config change
// should be needed, but worth a quick check if this doesn't fire.

export async function register() {
  // Only run in the Node.js runtime, not edge — env validation needs
  // full process.env access and this only needs to run once server-side,
  // not per-edge-request.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnv } = await import('@/lib/env');

    try {
      getEnv();
      console.log('✅ Environment variables validated');
    } catch (error) {
      console.error(error);
      // Fail fast on boot rather than letting the server start with a
      // broken config and failing later on whatever route happens to
      // need the missing var first — which is exactly what happened
      // earlier this session with a missing Stripe key surfacing as a
      // checkout 500 instead of an immediate, obvious boot failure.
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }
}
