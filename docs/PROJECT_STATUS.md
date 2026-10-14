# Project Status

**Last updated:** All spec phases (0-14) have a built artifact; see the
honest completeness notes below — "all phases touched" does not mean
"production ready." Read "What's genuinely untested" before trusting
this anywhere real.

## How to read this document

Every phase was built with real logic and, wherever this sandbox could
execute it without a live database/network (i.e. almost everywhere —
only Phase 2's actual DB writes and Phase 1's live BOM fetch are
excluded), that logic was **actually run** against realistic inputs,
including the spec's own worked examples, and checked line-by-line.
**Four real bugs were found and fixed this way** across the two build
sessions — this is the point of executing rather than just writing code:
a wrong answer only shows up when you actually run it.

## Phase-by-phase status

### Phase 0 — Repo, config, docs, test framework, DB connection: DONE
Syntax-checked only (no deps installable here).

### Phase 1 — Location system, provider abstraction, first providers: DONE
`OpenMeteoForecastProvider`, `BomObservationProvider`. Logic executed
against fixtures. **BOM's XML schema caveat, open since the original
Phase 1 session, was resolved in a later session** via web search (this
conversation's search/fetch access, not the sandboxed container) against
real captured samples — see the Phase-14-and-beyond update below.

### Phase 2 — Storage: DONE (schema only, never run against real Postgres)
Full ORM schema + hand-written Alembic migration + repository functions
enforcing forecast-run immutability. Syntax-checked only.

### Phase 3 — Model comparison: DONE, verified
Reproduces spec section 9's own ACCESS/ECMWF/GFS/ICON example exactly
(GFS correctly flagged as outlier).

### Phase 4 — Forecast verification: DONE, verified
Reproduces spec section 5's 43mm/57mm example exactly (MAE=14, bias=-14).

### Phase 5 — Risk & confidence engines: DONE, verified
Config-driven GREEN/AMBER/RED; confidence kept strictly separate,
correctly returns UNKNOWN rather than a manufactured number.

### Phase 6 — Adaptive scheduling: DONE, verified
Trigger-based override correctly forces immediate reanalysis even
seconds after a GREEN baseline analysis.

### Phase 7 — Hazard engines: PARTIAL, verified for what exists
**5 of 20 spec-listed hazard types**: rain, wind, heat, bushfire,
cyclone (existence/impact split). **Two real bugs found and fixed**
during testing: (1) fixed exposure/probability values inflated
near-zero-severity events into false AMBER across four engines; (2)
heat engine's severity curve had no "safe zone," so a comfortable 27C
day registered partial severity. Both fixed and re-verified. Numeric
thresholds are reasonable starting points, NOT verified against an
official BOM document.

### Phase 8 — Compound hazards: PARTIAL, verified for what exists
4 of the spec's example rules, each with a documented rationale.
Explicitly lists (in the module's own docstring) which rules are not
yet built, rather than omitting them silently.

### Phase 9 — Historical calibration: DONE, verified
Simple rolling bias correction only, per spec's explicit
"start simple" instruction. Minimum-sample-size gating confirmed to
correctly refuse both small-sample "corrections" and naive
recently-best-performer selection.

### Phase 10 — Dashboard: DONE for its core view, verified
`/dashboard`, `/dashboard/text`, `/api/models/comparison`,
`/api/models/performance` all wired into `app/main.py` and executed
directly (FastAPI itself stubbed, since it's not installed here) — output
matches spec section 34's example layout closely, including the
mandatory "not a replacement for BOM" safety banner, and now uses real
config-driven action playbooks (`config/action_playbooks.yaml`) instead
of hard-coded strings. Shows realistic EXAMPLE data, not live DB data —
documented seam to fix once Phase 2 has real rows. No verification
dashboard UI (spec section 37) — only the two simple JSON endpoints for
sections 35-36.

### Phase 11 — Alert engine: DONE, verified
`app/alerts/alert_engine.py` (trigger decision — GREEN->AMBER,
AMBER->RED, new hazard, official warning; explicitly does NOT alert on
mere "changed" or on risk improving, to avoid spam) and
`app/alerts/channels.py` (email/desktop formatting + dispatch via an
injected sender function, so it's testable without real SMTP/OS
notification access). **One real bug found and fixed**: a
`list.extend(...) or list.append(...)` line always executed the append
too (extend returns None, which is falsy), so emails showed
"(none specified)" even when real actions were listed. Fixed and
regression-tested. No routes/scheduler wiring yet — alerts are meant to
fire from the analysis pipeline, not be polled, and that pipeline
wiring doesn't exist yet (needs Phase 2 to be live first).

### Phase 12 — AI explanation layer: DONE for prompt+validation, verified
`app/ai_explanation/explanation_engine.py` — builds a strict prompt from
ONLY pre-computed structured facts (never raw provider data, never asks
the AI to compute anything), plus `validate_explanation_output()` as a
belt-and-braces post-hoc check. **One real, more serious bug found and
fixed**: the first version's "allow if it matches the previous risk
level" exemption could not distinguish "risk moved from AMBER to RED"
(legitimate) from "risk is currently AMBER" (a real violation, since
these share the substring "AMBER") — the exemption let the actual
violation through uncaught. Replaced with a window-based heuristic
checking for nearby change-describing words ("from", "up from", "was",
etc.) before allowing a non-current-level mention. Documented as still
imperfect (a determined adversarial phrasing could still evade it) —
flagged, not overclaimed. `app/ai_explanation/client.py` is a thin
wrapper with the actual Anthropic API call commented out, not
implemented/exercised (no network access, no API key in this sandbox).

### Phase 13 — Backtesting: DONE, verified
`app/backtesting/framework.py` — `as_of()` filter plus
`validate_no_lookahead()`, the direct enforcement of spec section 48's
single most critical rule. **Verified with a deliberately injected
violation**: fed the validator a dataset that included data from after
the simulated decision time, confirmed it correctly caught and reported
both violations rather than passing silently. No actual historical
backtest has been run — there's no historical data yet (see Phase 2).

### Phase 14 — ML: DELIBERATELY NOT BUILT
See `ML_DEFERRAL_RATIONALE.md`. Per spec section 46's explicit
instruction: no historical data exists to train or benchmark against
yet, and building ML code now — with nothing to benchmark it against —
would itself violate the spec's core principle that "accuracy claims
must be earned through backtesting and verification" (section 59). This
is a considered decision, not a skipped task.

## Post-Phase-14 update: BOM XML schema resolved

This update used the current conversation's web search/fetch access
(distinct from the sandboxed container's bash tool, which still has no
network) to resolve the BOM XML schema caveat that had been open since
the original Phase 1 session.

**What changed:**
- Confirmed the real `IDQ60920.xml` structure against an actual captured
  excerpt (found via a third-party developer-documentation site) and
  cross-checked against the `weather-au` PyPI package's real, working
  parser for this exact product.
- The `<period time-utc="...">` wrapper was already guessed correctly in
  the original implementation.
- Station attributes were meaningfully richer than originally assumed:
  confirmed real attributes are `wmo-id`, `bom-id`, `tz`, `stn-name`,
  `stn-height`, `type`, `lat`, `lon`, `forecast-district-id`,
  `description` — the original version only captured `stn-name` and
  `wmo-id`.
- `app/providers/bom.py` updated to capture `station_lat`/`station_lon`
  from the now-confirmed attributes.
- `tests/fixtures/bom_idq60920_synthetic.xml` updated to match the
  confirmed structure (values remain synthetic; only the schema needed
  confirming).
- `app/db/repository.py`'s `get_or_create_station()`/`store_observations()`
  updated to accept and persist the newly-available coordinates,
  upgrading the path toward a real nearest-station lookup (still a TODO
  — coordinates are now captured and stored, but the actual
  distance-based selection logic, replacing today's substring name
  matching, is not yet implemented).
- Also confirmed, while researching this: BOM's state-wide 10-minute
  product (what this system uses) is a **current, still-supported**
  product, listed separately from — not superseded by — a newer
  per-station 72-hour-history product.

**What's still NOT verified**: an actual live fetch of
`ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ60920.xml` from a network-connected
machine. Web search evidence from third-party sources is meaningfully
stronger than an unverified guess, but is not the same certainty as
parsing a live file byte-for-byte. Do that live check before final
production sign-off.

## Post-Phase-14 update #2: hazard threshold verification via web search

Same session, same method as the BOM XML resolution above — used this
conversation's web search access to check the hazard engines' numeric
thresholds against BOM's actual published criteria, rather than leaving
them as unverified guesses indefinitely.

**Wind (`app/hazards/wind_engine.py`) — genuinely corrected, not just
confirmed.** BOM's real published criteria: "damaging winds" = gusts of
90 km/h or more; "destructive winds" = gusts of 125 km/h or more
(sourced from bom.gov.au's severe weather knowledge centre and
weatherzone.com.au, both independently stating the same figures). The
previous thresholds (60 km/h AMBER, 100 km/h RED) were **not just
unverified — they were wrong**, understating BOM's real bands by a
meaningful margin. Corrected to 90/125 km/h gust bands. One existing
test (`test_severe_wind_is_red`) needed its `model_agreement` parameter
made explicit, since the corrected thresholds shifted where the
GREEN/AMBER/RED boundaries fall relative to the risk engine's default
model-agreement assumption — this was confirmed to be a test-input
issue, not an engine bug, by checking the same scenario with a realistic
model_agreement value and confirming it produced the expected RED
result.

**Heat (`app/hazards/heat_engine.py`) — methodology gap identified,
thresholds re-anchored.** BOM's real heatwave method is the Excess Heat
Factor (EHF): a *relative* comparison of forecast max/min temperatures
against that location's own trailing 30-day average AND long-term
climate normal, classified via percentile bands — not a fixed
temperature at all. This system cannot implement real EHF without
climatology data it doesn't have (same underlying gap as everywhere
else in this project: no live historical data yet). Rather than leave
an arbitrary guess in place, the fixed-threshold fallback was
re-anchored to a real, citable fact: Townsville's own recorded extremes
are 6 consecutive days over 35C and 4 consecutive days over 38C
(Townsville City Council HeatWatch report, citing BOM Special Climate
Statement 67) — genuinely rare/record events for that specific city.
AMBER/RED were set to 35C/38C accordingly. This is still a
simplification of BOM's real method, but it's now grounded in
Townsville-specific historical severity rather than a generic number.

**Rainfall (`app/hazards/rain_engine.py`) — methodology confirmed,
substitute number NOT found.** BOM's real "heavy rainfall" criterion is
also relative: rainfall exceeding the 10% Annual Exceedance Probability
(a 1-in-10-year event) for that specific duration and location — this
requires an IFD (rainfall intensity-frequency-duration) design-rainfall
table for Townsville specifically, which exists in BOM's data systems
but a specific number was not retrievable through the searches run this
session. The 50mm/100mm-per-24h thresholds remain an unverified
approximation — the module's docstring is honest about this being the
weakest-verified of the three corrected/reviewed thresholds, not
silently presented as equally solid.

All three engines were re-executed after these changes and confirmed to
still produce correct GREEN/AMBER/RED classifications end-to-end.



This sandbox has no network access and cannot install SQLAlchemy,
FastAPI, pydantic, Alembic, or pytest. "Verified" throughout this
document means: the actual Python logic was extracted (bypassing the
unavailable dependencies via lightweight stand-ins where needed) and run
directly against realistic inputs, including the spec's own worked
examples and, in three cases, deliberately adversarial/buggy inputs
designed to catch mistakes — which caught four real bugs. What was NOT
verified:

- ~~Nothing has run against a real PostgreSQL database~~ **Partially
  addressed**: the forecast-immutability guarantee and full schema were
  verified against a REAL SQLite database (real constraints, real SQL)
  via `scripts/verify_storage_sqlite.py` — see the dedicated section
  above. This is real evidence but SQLite is not Postgres; running
  `alembic upgrade head` against actual PostgreSQL remains undone and
  is the more authoritative check.
- Nothing has run through FastAPI's actual HTTP request/response cycle
- ~~The full `pytest` suite (now 25 test files) has never actually
  executed as a suite~~ **Resolved**: all 25 real, unmodified test files
  (150 individual assertions) were actually executed via a stdlib-only
  runner (`scripts/run_tests_stdlib.py`) with a narrow pydantic shim —
  see the dedicated section above. All 150 pass. This is not identical
  to running real `pytest` (some pytest features aren't supported by
  the shim runner — see `scripts/README.md`), but it is real execution
  of the real test files against the real app code, and it found one
  more genuine bug (a bad test assumption in test_model_comparison.py).
- ~~BOM's XML observation feed schema is still unverified against a real
  file~~ **Resolved in a later session** via web search against real
  captured samples and a real-world parser library — see the dedicated
  section further down this document. Not the same as a live fetch from
  this exact sandbox, but no longer an unchecked guess.
- No actual Anthropic API call has been made from the AI explanation
  layer — only its prompt-construction and output-validation logic

**First things to do in a real environment**, in order:
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
pytest                                     # confirm the full 25-file suite actually passes
alembic upgrade head
curl ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ60920.xml -o /tmp/real_bom.xml
# diff against app/providers/bom.py's assumptions
uvicorn app.main:app --reload
curl http://localhost:8000/dashboard/text
```

## Post-Phase-14 update #3: real test execution + real database verification

Same session as updates #1 and #2 above, going further: found real,
usable local resources in this sandbox that earlier sessions had wrongly
assumed didn't exist — stdlib `sqlite3` and a locally-installed
Playwright/Chromium — and used them properly instead of stopping at "no
network, no deps installed."

**The real test suite was actually executed for the first time.** All
three prior sessions' "verified" claims meant hand-extracted logic run
via ad-hoc scripts, never the real `tests/unit/*.py` files themselves.
This update built a minimal stdlib-only test runner
(`scripts/run_tests_stdlib.py`) plus a narrow, clearly-scoped
`pydantic`/`pydantic_settings` shim (`scripts/_pydantic_shim/`) and ran
the REAL, UNMODIFIED 25 test files against the REAL, UNMODIFIED app
code. Result: **150/150 assertions pass.** This found one more real bug:
`test_model_comparison.py` had a "sanity check" assertion
(`median != mean_absolute_deviation`) that is mathematically false for
some valid inputs (e.g. `[0, 100]`, where both equal 50) — not a real
requirement, just an incorrect assumption. Fixed to assert what the spec
actually requires instead. See `scripts/README.md` for exact scope and
limitations of this runner vs real pytest.

**The forecast-immutability guarantee was verified against a real SQL
database.** `scripts/verify_storage_sqlite.py` translates the Alembic
migration's schema into SQLite DDL and runs real INSERT statements
against a real database file, with real UNIQUE/FOREIGN KEY constraint
enforcement — not Python object assertions. Confirmed: storing a second
forecast run for the same location/variable/valid_time creates a
genuinely new row (distinct run_id) and leaves the first run's original
value completely unchanged, which is spec section 5's core requirement,
now checked against actual database behavior. Also confirmed the schema
correctly rejects a duplicate `(run_id, valid_time, variable)` insert
and an orphaned `forecast_run` referencing a non-existent location — real
constraint enforcement, not assumed.

**The network restriction was tested more rigorously, not just
assumed.** An initial attempt using Playwright (a real headless Chromium
browser, found already installed in this environment) to reach BOM's
IFD tool appeared to succeed — the page loaded without error. Checking
the actual rendered content, rather than just the absence of an
exception, revealed it was Playwright successfully rendering the
network proxy's OWN "host not in allowlist" denial page, not real BOM
content. This confirms the earlier conclusion (network genuinely
restricted at the proxy level, regardless of which tool — curl, pip, or
a real browser — attempts the request) was correct, but arrived at more
rigorously this time, and is a useful reminder in its own right: "no
exception was thrown" is not the same as "the request succeeded."



- **BOM XML schema — RESOLVED this session** via web search (this
  conversation has search/fetch access even though the sandboxed
  container does not). Confirmed against an actual captured IDQ60920.xml
  excerpt (via a third-party developer-documentation site) and
  cross-checked against the `weather-au` PyPI package's real parsing
  code. The `<period>` wrapper was already guessed correctly; station
  attributes were enriched (bom-id, tz, stn-height, type, lat, lon,
  forecast-district-id, description — previously only stn-name/wmo-id
  were captured). `app/providers/bom.py`, its fixture, and
  `app/db/repository.py` were updated to capture and store station
  lat/lon. This is NOT the same certainty as fetching a live file
  directly (still not done — no network access in the sandboxed
  container), but is meaningfully stronger evidence than the previous
  "best-effort guess, never checked" state, since it's now checked
  against externally-sourced real samples rather than general
  knowledge of how BOM XML is "commonly described."
- **Hazard threshold verification — PARTIALLY RESOLVED this session**
  (see the dedicated section below). Wind: verified exactly against
  BOM's published criteria. Heat: BOM's real method (Excess Heat
  Factor) confirmed but not implementable yet (needs climatology data
  this system doesn't have); fixed thresholds now anchored to
  Townsville's own recorded historical extremes instead of an arbitrary
  guess. Rainfall: BOM's real method (10% Annual Exceedance
  Probability) confirmed but a usable substitute number could not be
  extracted from available search results — still an unverified
  approximation, honestly flagged as such (worse-documented than wind
  or heat, not silently equal to them).
- **DB wiring: PARTIALLY RESOLVED this session** — see the dedicated
  section below. The dashboard route now genuinely queries the real
  database via `app/dashboard/db_queries.py`, with a labeled example-
  data fallback when nothing is on record yet. Phase 1's providers
  writing into Phase 2's storage via `app/db/repository.py` remains
  unwired (the functions exist and are documented, but nothing calls
  them yet from a scheduler or CLI entry point) — that piece is still
  open.
- **The 15 remaining hazard types** (spec section 11) — a scope decision
  for whoever continues this: build them all before going further, or
  treat the current 5 as sufficient for an initial real-world trial and
  add more based on what Townsville conditions actually demand

## Post-Phase-14 update #4: dashboard wired to real DB queries + a live demo UI

Two things happened this session, in response to being asked for
something clickable to trial.

**A live, standalone demo UI was published** — a self-contained HTML
page (not part of the Python app; ported logic, not a mockup) showing
three real trial scenarios with genuinely computed risk levels,
confidence labels, and config-driven "prepare now" actions matching the
real Python engines' thresholds and playbook text at the time it was
built. This is for trying the interaction model immediately, without
any local setup — it does not talk to the real backend (there isn't a
publicly reachable one), and is clearly labeled as a scripted preview,
not live data.

**`app/dashboard/routes.py`'s long-documented placeholder seam was
closed.** `app/dashboard/db_queries.py` is new: real query logic against
the real ORM models (`Hazard`, `RiskAssessment`, `OfficialWarning`,
`RiskChange`, `LocationModel`) — latest risk assessment for a location,
its associated hazard rows, active official warnings (filtered,
verbatim text per spec section 49), and the most recent risk-change
record if one exists. `routes.py` now calls this first and only falls
back to the previously-existing example data (now clearly labeled as
such in both the HTML and text responses) when the database has nothing
on record yet — an honest, useful fallback rather than the only path.

**Writing this surfaced two real, would-have-been-painful-later schema
bugs**, found by actually comparing the ORM models against what the
hazard engines really produce, not just by inspection:

1. `Hazard.severity` was typed `String(20)`, but every hazard engine
   (`HazardAssessment.severity`) produces a Python `float`. Storing a
   real hazard assessment would have hit a type mismatch the first time
   anyone tried it. Fixed in both `app/models/hazards_and_risk.py` and
   the hand-written Alembic migration.
2. Neither `Hazard` nor `RiskAssessment` had a column for
   `ConfidenceResult.reason` (the human-readable "based on: model
   agreement 75%..." string) — only the numeric value and, on
   `RiskAssessment`, a label. But `app/alerts/channels.py` and
   `app/ai_explanation/explanation_engine.py` both genuinely use
   `.reason` in their real output. Reading a `Hazard` back from the
   database would have silently lost that string. Added
   `confidence_reason` columns to both tables and to the migration.

**Both fixes were verified against a real database**, not just
Python-level type-correctness: `scripts/verify_storage_sqlite.py` was
extended with `verify_dashboard_query_logic()`, which builds the new
`hazards`/`risk_assessments`/`official_warnings` tables in real SQLite,
inserts a severity value with a real decimal fraction (0.65), and
confirms it round-trips through the database unchanged — proving the
Float column type fix actually works, not just that the Python
annotation looks right. It also confirms the "most recent assessment"
query correctly picks the newer of two rows (not just the last-inserted
one) and that the active-warning filter correctly excludes an inactive
warning while returning an active one's text completely verbatim.

**The stdlib test-running infrastructure was substantially extended** to
make this real testing possible: the `pydantic`-only shim
(`scripts/_pydantic_shim/`) now also includes a minimal, FUNCTIONAL
`sqlalchemy`/`sqlalchemy.orm` shim — not just import-satisfying, but
capable of actually defining and instantiating the real ORM model
classes as plain Python objects with correct attributes and defaults
(model instantiation and type structure are shimmed; real query
execution against a live connection is explicitly NOT — that gap is
closed separately via the real-SQLite script above). This let a new
test file, `tests/unit/test_dashboard_db_queries.py`, actually import
and exercise `app.dashboard.db_queries`'s pure functions
(`_row_to_confidence_result`, `_hazard_row_to_assessment`) against the
real, unmodified module — 6 new tests, bringing the total to **156/156
passing**, up from 150.

**What's still not verified**: the actual SQLAlchemy query-building
code in `db_queries.py` (the literal `select(Hazard).where(...)`
statements) has not run through real SQLAlchemy against a real
connection — the shim proves the model classes are structurally sound
and the raw-SQL script proves the query design is sound, but a real
`pytest` run against real PostgreSQL remains the authoritative
end-to-end check, same as everywhere else in this project.

## Post-Phase-14 update #5: analysis pipeline built end-to-end, three real scoring bugs found and fixed

This session built the piece that was still missing between "hazard
engines exist" and "the dashboard shows something real": a pipeline that
turns a raw forecast into stored `Hazard`/`RiskAssessment` rows.

**New code:**
- `app/pipeline/analysis.py` — aggregates individual `HazardAssessment`s
  into one overall risk level and confidence, with documented rules:
  overall risk is the WORST hazard level (never averaged); `UNKNOWN`
  never lowers the result (an unassessed hazard is not evidence of
  safety); overall confidence is the LOWEST confidence among the
  hazards actually driving the level (a confident GREEN must not
  inflate confidence in a shaky RED); an unassessed hazard caps overall
  confidence below HIGH. All of this was executed against deliberately
  adversarial inputs (all-UNKNOWN, confident-GREEN-plus-shaky-RED,
  RED-then-suddenly-calm) and behaved correctly on every case checked.
- `app/pipeline/orchestrator.py` — converts flat forecast records
  (provider output) into the `RainfallAccumulations`/`WindConditions`/
  `HeatConditions` shapes the engines expect. Central rule: missing
  data produces `None`/`UNKNOWN`, never a silently-assumed zero.
  Bushfire and cyclone have no data source yet and are correctly
  reported `UNKNOWN`, not defaulted to GREEN.
- `app/pipeline/persistence.py` — writes a `PipelineResult` into
  `RiskAssessment`/`Hazard`/`RiskChange` rows. `RiskAssessment` and
  `RiskChange` are append-only; `Hazard` rows hold current state and are
  updated in place. The JSON contract between this writer and
  `db_queries.py`'s reader was verified round-trip correct.
- `app/pipeline/run.py` — a CLI (`python -m app.pipeline.run --demo
  calm|storm|empty`) that runs the ENTIRE chain (orchestrator -> engines
  -> aggregation -> action playbooks) on a synthetic forecast, with no
  network or database needed. This is now genuinely runnable end to end
  in this sandbox, and was actually run — see the demo output captured
  below.

**Three real scoring bugs were found by actually running the pipeline
against edge cases, not by inspection:**

1. **A short, extreme rain window was reported as calm.** The rain
   engine took `accumulations.twenty_four_hour or 0.0` — so a forecast
   with 120mm in the only 6 hours it covered (no 24h window available)
   silently became "0mm, GREEN, severity 0.0", while the SAME
   accumulations object's `six_hour` field showed extreme rain. Fixed:
   a shorter window is a strict lower bound on rainfall over any longer
   window containing it (rain cannot un-fall), so the engine now uses
   the largest available window at or under 24h as a documented lower
   bound, and says so explicitly in its evidence line rather than
   presenting an estimate as a measured total. Windows LONGER than 24h
   are deliberately NOT used this way, since they could include rain
   outside the 24h period and would overstate it.

2. **A comfortable day was rated AMBER because of an ordinary tropical
   night.** The heat engine took `severity = max(day_severity,
   night_severity)` — so a mild 27C day with a 27C overnight low (an
   unremarkable night for Townsville) scored severity 0.72, AMBER, with
   no hot day involved at all. Fixed in two parts: (a) the engine now
   treats the night as COMPOUNDING an already-hot day rather than as an
   independent trigger — `day_severity * (1 + 0.25 * night_severity)`,
   so a night can raise the severity of a genuinely hot day by up to
   25%, but can never lift a comfortable day above zero; (b) the
   orchestrator's `extract_heat_conditions` used to take the coldest
   reading ANYWHERE in the 72h window as the "overnight minimum" — which
   could pick up a cool afternoon rain shower and call it a night. Fixed
   to only look at local night hours (00:00-06:00, UTC+10), and to
   return `None` (not a guess) when the forecast window contains no
   night-time readings at all. The first attempt at fix (a) used a 50%
   compounding factor and over-corrected: it pushed ordinary hot days
   straight to the severity ceiling, which silently broke the spec's
   OTHER explicit requirement (duration matters — a 1-day hot spell and
   a 4-day heatwave must score differently). Caught by running the full
   test suite, not just the new scenario; reduced to 25%, which
   satisfies both requirements — verified by re-running the fixed suite.

3. **Model disagreement could downgrade an already-extreme reading.**
   `probability = severity * model_agreement` in the rain, wind, and
   heat engines meant that low model agreement on a genuinely severe
   forecast (e.g. 130mm, deep in the RED band) could pull the
   `probability` term down enough to drag the overall RISK SCORE into a
   lower band — so disagreement among models could make an extreme
   forecast look safer, which is backwards for a safety-critical system.
   This was found by systematically checking every combination of
   rainfall total and `model_agreement` value across GREEN/AMBER/RED
   and counting cases where a lower agreement value produced a LOWER
   risk level for the SAME rainfall total ("downgrades") — 3 such cases
   existed. Fixed by removing model_agreement from the probability
   calculation entirely in all three engines: how much to TRUST an
   assessment is exactly what the separate confidence engine is for
   (spec section 10 exists precisely so risk and confidence are never
   conflated), and it already handles this correctly. After the fix,
   the same systematic check found zero downgrades, and the risk level
   for a fixed rainfall/wind reading no longer varies with
   model_agreement at all (confirmed by direct test).

**A related, DISTINCT issue was found but deliberately NOT "fixed" in
this pass**: after bug 3's fix, the mapping between the risk engine's
weighted score and the documented per-hazard mm/km-h thresholds is
looser than intended — e.g. 40mm (clearly under the rain engine's own
documented 50mm AMBER threshold) still scores as AMBER once the other
weighted factors (exposure, duration, probability) are added on top of
severity. This is a genuine calibration gap in
`app/risk/risk_engine.py`'s general-purpose weighted-sum design versus
each hazard engine's own documented thresholds — worth investigating
properly (likely needs the weights themselves re-examined against
real data, per spec section 46's "don't hand-tune without evidence"
discipline) rather than patched reactively while chasing an unrelated
bug. Flagged here and in TODO.md rather than silently re-tuned.

**Verification performed:**
- All three fixes were checked against the ORIGINAL failing case AND a
  battery of regression cases (the values that were already correct
  before the fix, to confirm nothing that used to work broke).
- 43 new tests added across `test_pipeline_analysis.py` (11),
  `test_pipeline_orchestrator.py` (19, including the rain lower-bound
  and heat night-hours regressions), plus regression tests appended to
  `test_heat_engine.py`, `test_rain_engine.py`, and `test_wind_engine.py`
  for the specific bugs found. Full suite via
  `scripts/run_tests_stdlib.py`: **197/197 passing**, up from 156.
- The full CLI (`python -m app.pipeline.run --demo storm`) was actually
  executed and its output read end to end, not just its component
  functions in isolation — this is what surfaced bug 1 in the first
  place (the demo's "storm" scenario originally showed calm rain
  despite an obviously heavy synthetic forecast, which is what
  prompted checking the rain engine's window logic).

**What `--live` still needs** (documented in `run.py`'s own docstring,
not run in this session): a real environment with SQLAlchemy installed,
a reachable PostgreSQL database with the migration applied, and network
access to Open-Meteo. The `--demo` path has none of these requirements
and is fully exercised.

## Post-Phase-14 update #6: the risk-score calibration gap (flagged in update #5) is fixed

Update #5 found a real calibration gap but deliberately did not patch it
reactively. This update investigated and fixed it properly.

**The problem, precisely:** every hazard engine documents its own
severity calibration (e.g. rain_engine.py's `_severity_for`: severity
0.5 = AMBER threshold, 0.85 = RED threshold). But `risk_engine.py`'s
general-purpose weighted-sum formula (severity + probability + exposure
+ duration, each independently weighted) was applied uniformly to every
hazard — including rain, wind, and heat, where probability/exposure/
duration are not independently measured at all, they are DERIVED from
severity (`probability = severity`, `exposure = 0.7 * severity`, etc,
added during earlier bug fixes). The result: a severity of 0.49
(documented as "just under AMBER" by the engine itself) scored 42.9 on
the old formula — because the derived factors added their own weight on
top of severity's own weight, for the same underlying signal counted
twice.

**The fix:** a new `RiskFactors.severity_is_independent` flag.
- `True` (rain, wind, heat — now set in all three engines): the score
  IS severity's own 0-100 mapping, checked against a SEPARATE band set
  (`score_to_risk_level_from_severity()` in `app/risk/levels.py`,
  0.5/0.85 to match each engine's documented calibration exactly, not
  the generic config-driven bands) — plus only `model_agreement` and a
  genuine compound-hazard match, since those are the only two inputs in
  this mode that carry information severity does not already contain.
- `False` (the default — bushfire, cyclone, both of which DO have
  independently-measured probability/exposure): completely unchanged,
  original weighted-sum behavior.

**This took three attempts to get right, and each wrong attempt was
caught by immediately re-running the exact same quantified check
against the previous attempt, not by assuming success:**
1. First attempt added an unconditional small "nudge" from the derived
   factors on top of the severity anchor — still pushed 0.49 into AMBER,
   just less far. Caught by re-running the check.
2. Second attempt tried a zero-centred nudge (deviation from an assumed
   "neutral" derived-factor value at that severity) — required guessing
   each engine's own scaling convention and still crossed boundaries
   once duration's saturation curve was accounted for. Caught by
   re-running the check again.
3. Third attempt (the one that shipped): when severity_is_independent
   is True, the derived factors contribute NOTHING beyond severity —
   because if they are computed FROM severity, by construction they
   contain no information severity does not already have, so averaging
   them back in at any nonzero weight reopens the bug to a lesser
   degree. Confirmed exactly correct against the quantified probe.

**A related discovery while verifying fix #3**: the new severity bands
(0.5/0.85) revealed that the config's generic bands (green_max=33,
amber_max=66) were never actually aligned with what the hazard engines
document as their own thresholds — they were calibrated for the OLD
multi-factor formula, where severity alone legitimately needed extra
weight from other factors to cross a boundary. This was always latent;
update #6's fix just made the misalignment visible and necessitated the
separate band function rather than papering over it by reusing the
existing one.

**A second real finding while testing the fix**: one of the new
regression tests from update #5 (`test_model_agreement_does_not_change_
risk_level_for_fixed_rainfall`, checking 40/95/130mm) failed after the
fix — 95mm's severity (0.815) sits only 3.5 points below the RED
cutoff (85), within the bounded +5 model_disagreement nudge, so low
agreement legitimately pushes it into RED. This is correct, INTENDED
behavior (spec section 10: model disagreement should increase caution
near a boundary), not a new bug — confirmed by checking that the
disagreement bonus can never promote a CLEARLY safe severity (0.2, 0.3)
regardless of how bad agreement is, only nudge genuinely borderline
cases. The test was too strict (asserting identical levels at EVERY
agreement value, rather than the real invariant of never a DOWNGRADE);
fixed to test the correct property, plus added a proper sweep test
(every 5mm from 0-150mm, high vs low agreement) that checks the
downgrade-never invariant exhaustively rather than at three
hand-picked points — and the same sweep was run against wind and heat
too (every 5km/h and every 1C respectively), finding zero downgrades in
either.

**Result**: 200/200 tests passing (up from 197), including two new
exhaustive sweep tests that are strictly stronger than the point checks
they replaced. Both offline demo scenarios (`--demo calm`,
`--demo storm`) were re-run and produce correctly-calibrated output —
the storm demo's 96mm rainfall (severity 0.822, between the 50mm AMBER
and 100mm RED thresholds) now correctly reads AMBER rather than being
silently over- or under-stated by unrelated factors.

## Post-Phase-14 update #7: flood engine built (6th of 20 hazard types)

`app/hazards/flood_engine.py` — the first of the remaining 15 hazard
types to be built, per spec section 14.

**What it does:**
- `FlashFloodEngine`: a real, working engine using rainfall INTENSITY
  (1-hour peak, not the 24h total heavy_rainfall uses) — the spec's own
  rationale for keeping rain and flood separate (section 13). Optional
  antecedent-rainfall (7-day) input compounds an already-real event
  (same pattern as heat's night-compounds-day fix and the existing
  heavy_rain_plus_saturated_catchment compound rule) without ever
  creating risk from zero rainfall.
- `river_flooding` and `coastal_flooding`: correctly reported UNKNOWN,
  not GREEN, because no RiverProvider or TideProvider exists yet (spec
  section 4 lists these interfaces; neither has a concrete
  implementation). Stated honestly in both the code and the hazard's own
  `description` field, which the dashboard will show directly, rather
  than silently omitting these hazards or guessing a value.
- `severity_is_independent=True` and the exhaustive model-agreement
  sweep invariant (never a downgrade) were applied FROM THE START this
  time, rather than discovered as a bug after the fact — the lesson from
  the two previous rounds' rain/wind/heat fixes was applied proactively.
  Verified with the same sweep (every 2mm, 0-70mm): zero downgrades.

**Wired into the pipeline:**
- `app/pipeline/orchestrator.py` now calls `assess_flooding()` whenever
  rainfall data is available, reusing the already-extracted
  `RainfallAccumulations` rather than re-parsing forecast records.
- Two new compound hazard rules: `heavy_rain_plus_flash_flood` (both
  the 24h total AND the 1h intensity independently elevated — a
  distinct signal from either alone) and `cyclone_plus_flash_flood`
  (a cyclone's rain bands can flash-flood independently of its 24h
  total or its wind). Both documented with their own rationale per spec
  section 26's requirement.
- `config/action_playbooks.yaml` gained real guidance for all three new
  hazard types (flash/river/coastal flooding) — without this, a flash
  flood warning would have produced an empty "prepare now" list.

**Verified end to end**: the offline demo
(`python -m app.pipeline.run --demo storm`) now correctly shows Flash
Flood as GREEN (steady 4mm/h rain, no concentrated burst) even while
Heavy Rainfall reads AMBER from the 24h total — exactly the behavior
spec section 13 requires and exactly what a steady, non-flashy storm
should produce. A second synthetic test (concentrated 45mm in a single
hour) correctly produces Flash Flood RED while the 24h-total-based
Heavy Rainfall assessment alone would not have justified RED.

One existing test (`test_all_hazards_are_always_present_in_the_output`)
needed updating — it pinned the OLD 5-hazard set and correctly failed
once 3 new hazard types were wired in; not a bug, a test that correctly
caught its own assumption going stale.

**Result**: 218/218 tests passing (up from 200), 11 new tests across
`test_flood_engine.py` and `test_orchestrator_flood_integration.py`,
plus 4 new compound-hazard tests.

**Hazard types remaining** (14 of the original 20, flood now done):
severe thunderstorms, hail, lightning, tropical low (distinct from the
existing cyclone engine), storm surge, coastal flooding proper (today's
`coastal_flooding` is an UNKNOWN placeholder, not a real
`coastal_engine.py`), dangerous surf/swell, smoke, dust, UV,
visibility/fog.

## Post-Phase-14 update #8: live scheduler wired (closes a long-standing TODO)

Everything in the pipeline (orchestrator, engines, persistence) has been
real, working logic since earlier sessions — but nothing actually CALLED
it on a timer. This update closes that gap.

**New code:**
- `app/pipeline/run.py` refactored: the actual work in `run_live()` is
  now `execute_live_cycle()`, returning a `PipelineResult` instead of
  printing and exiting — so a caller (the scheduler) can inspect what
  happened. `run_live()` is now a thin CLI wrapper around it; behavior
  unchanged for existing CLI usage.
- `app/scheduler/live_runner.py` — the actual scheduling loop.
  `run_scheduler_tick()` reads current state from the database, calls
  `app.scheduler.adaptive_scheduling.decide_next_analysis()` (spec
  section 29's logic, built and tested in an earlier session but never
  wired to anything), and runs `execute_live_cycle()` when due. `main()`
  wraps this in an APScheduler `BlockingScheduler`, checking every 30
  minutes (shorter than RED's 6-hour baseline, so that cadence is
  actually caught) — intended to run as a long-lived process, not cron,
  since adaptive scheduling's whole point is varying the interval.
- `check_triggers()` is honestly a stub returning `[]` — spec section
  29's trigger conditions (new official warning, rapid forecast change,
  etc) each need their own data source wired in, none of which exist
  yet. Documented as a real gap in the function's own docstring rather
  than faked, since a fake trigger check would look like working
  functionality in the dashboard's "why did this run" explanation when
  it is not.

**Verified**: `scripts/verify_live_runner.py` exercises the scheduling
DECISION logic (never-analysed / GREEN-recent / RED-due / RED-not-yet-
due / GREEN-overdue) by monkeypatching `execute_live_cycle` with a
counter — confirming the scheduler runs exactly when it should and
skips exactly when it shouldn't, across 5 scenarios including the two
edge cases that matter most (an overdue GREEN location still gets
checked; a RED location checked 2 hours ago correctly waits). The same
5 scenarios are now also a real pytest-style file,
`tests/unit/test_live_runner.py` (6 tests), made possible by extending
`scripts/run_tests_stdlib.py` with a genuine, teardown-verified
`monkeypatch` fixture — deliberately checked with a two-test isolation
probe (one test patches a function, a second confirms it sees the
original) before trusting it, then removed once confirmed working.

**What's still not verified**: `main()`'s actual APScheduler timer loop
and `get_current_state()`'s real SQL query both need a real environment
(the `apscheduler` package and a live database connection, neither
available in this sandbox) — same honest boundary as everywhere else in
this project. The decision logic they wrap IS verified; the wrapping
itself is not.

**Result**: 224/224 tests passing (up from 218).

## Post-Phase-14 update #9: packaged for actual end-user setup (Docker + QUICKSTART)

Previous updates made the system real and tested; this one makes it
something a non-developer could plausibly get running on their own
computer, which it genuinely was not before — there was no path from
"download this zip" to "see it working" that didn't involve reading
source code.

**New files:**
- `Dockerfile` — builds the app image. Deliberately does NOT install
  `libpq-dev`/`gcc` (an earlier draft did): `psycopg2-binary` ships
  prebuilt wheels and needs no system build tools, so that apt-get step
  was pure unneeded image bloat, caught and removed before shipping.
- `docker-entrypoint.sh` — waits for Postgres's port to open, runs
  `alembic upgrade head`, then starts either the API (`uvicorn`) or the
  scheduler (`python -m app.scheduler.live_runner`) depending on which
  service invokes it.
- `docker-compose.yml` — three services (db, api, scheduler) with the
  API and scheduler as SEPARATE containers sharing one Postgres, so the
  dashboard stays responsive independent of the scheduler's long-running
  loop. Named volume for Postgres data so `docker compose down` (without
  `-v`) preserves stored analyses across restarts.
- `.dockerignore` — explicitly excludes `scripts/_pydantic_shim/` (this
  project's own sandbox-only testing shims) from the built image. They
  are harmless even if copied in (nothing sets `PYTHONPATH` to include
  them inside the container — checked explicitly, not assumed), but
  have zero purpose in a real image.
- `QUICKSTART.md` — the actual "how do I use this" document, written for
  someone who is not a developer. Three paths, in order of effort: (1)
  the already-published live browser demo, zero install; (2) the real
  system via `docker compose up`; (3) a fully offline synthetic-data CLI
  demo for anyone who wants to see the real engines run without
  installing Docker at all.
- `README.md` — rewritten from scratch. The old version still described
  the project as being at its original Phase 0 state and led with
  internal architecture notes instead of "how do I run this" — genuinely
  unusable as a front door. Now leads directly to QUICKSTART.md.

**Windows was specifically checked, not assumed to work:**
- `QUICKSTART.md`'s offline-demo instructions originally used
  `PYTHONPATH="scripts/_pydantic_shim:."`, which is Unix-only syntax (a
  `:`-separated path list) — PowerShell and cmd.exe both need `;` and
  backslash separators. Added separate, correct instructions for
  PowerShell and cmd.exe rather than leaving a command that would
  silently fail to find the shim on Windows.
- `scripts/verify_storage_sqlite.py` had a hardcoded `/tmp/...` path,
  which does not exist on Windows. Fixed to use `tempfile.gettempdir()`.
  Re-ran the script after the fix to confirm it still produces the same
  "ALL REAL-DATABASE VERIFICATION CHECKS PASSED" result, not just that
  it no longer references `/tmp` literally.
- Checked `app/pipeline/*.py`, `app/providers/*.py`, and
  `app/db/*.py` for any other POSIX-only path handling — none found.
- The Docker path sidesteps Windows Python/PostgreSQL installation
  friction entirely (everything actually runs inside a Linux container
  regardless of host OS), which is now explicitly called out in
  QUICKSTART.md as the reason to prefer it on Windows specifically.

**What's still honestly unverified**: this Dockerfile/compose setup has
never been run against a real Docker daemon (none available in this
sandbox, consistent with every other "needs a real environment" caveat
in this document) — it is written correctly against the project's real
`requirements.txt`, `alembic.ini`, and app structure, not guessed, but
"written correctly" and "confirmed to build and run end to end" remain
different claims. The one thing this update could not do that a real
environment still needs to: actually run `docker compose up` once and
confirm it works exactly as QUICKSTART.md describes.

**Result**: all 224 tests still pass after these changes (confirmed by
re-running the full suite, not assumed from the diff alone).

## Post-Phase-14 update #10: npm wrapper added (Docker alternative)

The user asked for npm instead of Docker. This is still a Python/
FastAPI/PostgreSQL project, not a Node project — there is no `npm
install` that makes sense for the actual application — but npm now
works as a genuine task-runner wrapper around it, so `npm run setup` and
`npm start` work as advertised without pretending this is a Node app.

**New files**: `package.json` (defines `setup`, `start`, `demo`, `stop`,
`test`) and `scripts/npm/{_common,setup,start,demo,stop,test}.js`.

**What was actually tested, in this sandbox, for real:**
- `npm run demo` (all three scenarios: calm/storm/empty) — runs
  correctly end to end, including the real flood engine added in an
  earlier update. Confirmed by checking actual `OVERALL RISK` output,
  not just exit codes.
- `npm run demo -- nonsense` — correctly rejected with a clear error
  rather than a cryptic Python traceback.
- `npm test` — runs the real 224-test suite via the existing stdlib
  runner; confirmed 224/224 pass through this new entry point.
- `npm run setup`'s actual failure path — run for real against this
  sandbox's no-network, no-PostgreSQL environment. It correctly: found
  the existing Python 3, attempted `pip install`, and failed with a
  clear, accurate message when `fastapi` couldn't be fetched. The FIRST
  version of that error message was wrong for this failure mode (it
  assumed any pip failure was psycopg2/pg_config-related) — caught by
  actually triggering the failure and reading the output, then rewritten
  to cover the real range of causes (network/firewall first, then the
  psycopg2 case) rather than guessing which message would be needed.
- `npm run stop` and `npm start` with no venv present — both produce the
  intended clear guidance rather than a confusing low-level error.
- Dead code: `_common.js` originally defined an unused `PID_FILE`
  constant from an earlier design thought (a pidfile approach that was
  dropped once `npm start` was built to run in the foreground instead).
  Found by grepping for actual usage before considering this "done," not
  left in on the assumption it might be needed later.

**Windows-specific correctness** (reasoned through carefully, since this
sandbox cannot run Windows to confirm directly — this is the one honest
limit on this round's verification): every venv path helper
(`venvPython`, pip/alembic/uvicorn paths in setup.js/start.js) correctly
branches on `IS_WINDOWS` between `Scripts/*.exe` and `bin/*`, matching
how Python actually lays out a venv on each platform. `demo.js`/`test.js`
use `path.delimiter` (`;` on Windows, `:` elsewhere) for `PYTHONPATH`
instead of the hardcoded `:` that QUICKSTART.md's raw shell instructions
needed manual platform-specific versions for — Node handles this
correctly on its own here, which is a genuine advantage of the npm
wrapper over asking users to type shell-specific commands directly.

**What `npm run setup`/`npm start` do NOT do** (stated honestly, not
discovered as a surprise later): there's no bundled PostgreSQL — the
user needs one already running, same requirement as the Docker path, just
without Docker handling it invisibly. There's no running background
scheduler wired to `npm start` — `app/scheduler/live_runner.py` exists
and is tested (see update #8) but isn't started by this npm path; a
user gets fresh data by re-running `app.pipeline.run --live` manually.
Both gaps are stated plainly in QUICKSTART.md rather than glossed over.

**Still not verified** (the actual limit, same shape as everywhere else
in this project): `npm run setup` completing successfully against a
REAL PostgreSQL connection, and `npm start` actually serving the
dashboard end to end — both need a machine with PostgreSQL running,
which this sandbox does not have. The error paths for NOT having that
were genuinely exercised; the success path was not.

**Result**: 224/224 tests still pass after adding this wrapper
(confirmed via `npm test` itself, not just the existing Python-native
runner).
