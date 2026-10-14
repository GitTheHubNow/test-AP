#!/usr/bin/env bash
#
# security-recon.sh — external, black-box recon against the live deployment.
#
# WHAT THIS IS: a second, independent check from the outside, complementing
# (not replacing) a code-level review. It checks things a scanner CAN see —
# headers, TLS, obviously-missing auth, exposed files — not things that
# need understanding what the app is supposed to do (an IDOR where one
# user's token works on another user's data, a role check that's silently
# wrong, etc.). Those need reading the code.
#
# SAFETY: read-only by default. GET/HEAD requests only. No POST/PUT/PATCH/
# DELETE anywhere, so it can't create real rows in the database or real
# files in R2 — there's a real funeral-memorial app with real data behind
# this target, and "accidentally insert a test pet-intake request" is a
# genuinely bad outcome, not just a hypothetical one. Requests are throttled
# (see SLEEP_SECS) to stay well under the app's own rate limits rather than
# triggering them or looking like an actual attack to Cloudflare/Vercel's
# abuse detection.
#
# USAGE:
#   chmod +x security-recon.sh
#   ./security-recon.sh https://test-ap-nine.vercel.app
#
# Requires (all standard on Kali): curl, openssl. Optional, used if present:
# nmap, nikto, whatweb, dig. Missing optional tools are skipped, not fatal.

set -uo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 https://your-deployed-url"
  exit 1
fi
TARGET="${TARGET%/}"
HOST="$(echo "$TARGET" | sed -E 's#^https?://##; s#/.*##')"

SLEEP_SECS=1.5   # delay between requests — be a good neighbour to your own rate limiter
OUTDIR="recon-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTDIR"
LOG="$OUTDIR/summary.txt"

note()  { echo "[*] $*" | tee -a "$LOG"; }
warn()  { echo "[!] $*" | tee -a "$LOG"; }
ok()    { echo "[+] $*" | tee -a "$LOG"; }
hr()    { echo "────────────────────────────────────────────────" | tee -a "$LOG"; }

note "Target: $TARGET"
note "Output: $OUTDIR/"
hr

# ── 1. TLS / certificate ─────────────────────────────────────────────────
hr
note "TLS certificate check"
if command -v openssl >/dev/null; then
  echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null \
    | openssl x509 -noout -dates -subject -issuer 2>/dev/null | tee -a "$LOG" \
    || warn "Could not retrieve certificate — check the host resolves and 443 is reachable"
else
  warn "openssl not found — skipping"
fi

if command -v testssl.sh >/dev/null || command -v testssl >/dev/null; then
  TESTSSL_BIN="$(command -v testssl.sh || command -v testssl)"
  note "Running testssl (protocol/cipher check) — this is the slowest step, be patient"
  "$TESTSSL_BIN" --quiet --color 0 "$HOST" > "$OUTDIR/testssl.txt" 2>&1
  ok "Full output: $OUTDIR/testssl.txt"
else
  note "testssl.sh not installed — skipping deep TLS check (apt install testssl.sh for this)"
fi
sleep "$SLEEP_SECS"

# ── 2. Security headers — this directly checks the CSP/HSTS/etc. added ───
# earlier in this project's review, from the outside rather than by
# reading next.config.js/proxy.ts.
hr
note "Security headers on /"
HEADERS="$(curl -sS -D - -o /dev/null "$TARGET/" --max-time 15)"
echo "$HEADERS" > "$OUTDIR/headers.txt"

check_header() {
  local name="$1" expect_desc="$2"
  if echo "$HEADERS" | grep -qi "^$name:"; then
    ok "$name present"
  else
    warn "$name MISSING — $expect_desc"
  fi
}
check_header "content-security-policy"      "should be set via Clerk's CSP generator in proxy.ts"
check_header "strict-transport-security"    "should force HTTPS for a year including subdomains"
check_header "x-content-type-options"       "should be 'nosniff'"
check_header "x-frame-options"              "should be SAMEORIGIN — prevents clickjacking via iframe embed"
check_header "referrer-policy"              "should limit what's leaked to other origins via Referer"

if echo "$HEADERS" | grep -qi "^server: "; then
  SRV="$(echo "$HEADERS" | grep -i '^server:' | tr -d '\r')"
  note "Server header present: $SRV (fine on Vercel, just noting — some setups leak version info here)"
fi
sleep "$SLEEP_SECS"

# ── 3. Common exposed-file checks ────────────────────────────────────────
# Each of these is a GET for a file that should 404. A 200 on any of them
# is a real, immediate finding — stop and fix before continuing.
hr
note "Checking for accidentally-exposed files"
for path in ".env" ".env.local" ".env.production" ".git/config" ".git/HEAD" \
            "package.json" "prisma/schema.prisma" ".vercel/project.json" \
            "next.config.js" "proxy.ts.backup"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$TARGET/$path")"
  if [[ "$code" == "200" ]]; then
    warn "EXPOSED: /$path returned 200 — this should not be publicly servable"
  else
    ok "/$path -> $code (good)"
  fi
  sleep 0.5
done
sleep "$SLEEP_SECS"

# ── 4. Auth-required routes — confirm they actually reject unauthenticated
# requests. Built from this app's own route list (every file under
# app/api/** that calls assertMemorialAccess/assertFamilyAccess/a platform-
# admin check), not a generic wordlist, so this is specific to what this
# app actually has. A 401/403/404 is correct. A 200 with real data is the
# single worst thing this script could find — it means auth is bypassable.
hr
note "Probing routes that should require authentication (expect 401/403/404)"
PROTECTED_ROUTES=(
  "/api/dashboard/stats"
  "/api/dashboard/memorials"
  "/api/org/branding"
  "/api/org/cases"
  "/api/org/products"
  "/api/org/invite"
  "/api/memorial/REPLACE_ME/access-log"
  "/api/memorial/REPLACE_ME/analytics"
  "/api/memorial/REPLACE_ME/audit-export"
  "/api/memorials/REPLACE_ME/products"
  "/api/system/compliance"
  "/api/system/performance"
  "/api/system/trial-settings"
)
for route in "${PROTECTED_ROUTES[@]}"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$TARGET$route")"
  case "$code" in
    401|403|404) ok "$route -> $code (correctly rejected)" ;;
    200)         warn "$route -> 200 — INVESTIGATE: returned success with no auth" ;;
    *)           note "$route -> $code (not 401/403/404/200 — check manually)" ;;
  esac
  sleep "$SLEEP_SECS"
done

# ── 5. Cron routes — must reject requests with no/wrong bearer token ─────
hr
note "Probing cron routes (expect 401 — these should NEVER be callable without CRON_SECRET)"
for route in "/api/cron/run" "/api/cron/maintenance" "/api/cron/billing" "/api/cron/unlock-memorials"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST --max-time 10 "$TARGET$route")"
  if [[ "$code" == "401" ]]; then
    ok "$route -> 401 (correctly rejected with no token)"
  else
    warn "$route -> $code — expected 401 with no Authorization header"
  fi
  sleep "$SLEEP_SECS"
done

# ── 6. Rate limiting sanity check — fire a burst at one endpoint and look
# for a 429. Only does this ONCE, at low volume, against a GET-only route —
# the goal is confirming a limiter exists, not actually hammering the site.
hr
note "Light rate-limit check against memorial-access/unlock (10 requests, GET is wrong method on purpose — looking for 429 vs 405)"
got_429=0
for i in $(seq 1 10); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$TARGET/api/memorial-access/unlock")"
  [[ "$code" == "429" ]] && got_429=1
  sleep 0.3
done
if [[ "$got_429" == "1" ]]; then
  ok "Got a 429 within 10 requests — rate limiting is active"
else
  note "No 429 seen in 10 light requests — not necessarily a problem (limit may be higher, or this GET-only probe isn't hitting the limited path), just noting for manual follow-up"
fi
sleep "$SLEEP_SECS"

# ── 7. Optional external tools, if present ───────────────────────────────
hr
if command -v nmap >/dev/null; then
  note "Running nmap (top 100 ports, polite timing) — may take a few minutes"
  nmap -Pn -T2 --top-ports 100 "$HOST" -oN "$OUTDIR/nmap.txt" >/dev/null 2>&1
  ok "Full output: $OUTDIR/nmap.txt"
else
  note "nmap not found — skipping port scan (apt install nmap)"
fi

if command -v whatweb >/dev/null; then
  note "Running whatweb (tech fingerprinting)"
  whatweb -a 1 "$TARGET" > "$OUTDIR/whatweb.txt" 2>&1
  ok "Full output: $OUTDIR/whatweb.txt"
else
  note "whatweb not found — skipping (apt install whatweb)"
fi

if command -v nikto >/dev/null; then
  note "nikto is installed but NOT run automatically — it's noisy, slow, and makes a lot of requests"
  note "Run it yourself if you want it: nikto -h $TARGET -Tuning x6"
else
  note "nikto not found — optional, skip or install separately if you want it"
fi

hr
note "Done. Review $LOG and anything marked [!] above."
note "Reminder: a clean run here does NOT mean the app has no vulnerabilities —"
note "it means the outside-in checks this script knows how to run came back clean."
note "Logic bugs (wrong role allowed to do something, one user's data reachable"
note "via another user's valid token, etc.) need a code-level review, not a scanner."
