# Automatic festival linking: October15 shadow preparation

Craig approved automatic source-bound festival linking, with a historical
evaluation followed by a complete regular-parse shadow run before live
publication. Preparation started11:48 UTC,35 minutes before the stated parse
deadline. Production parser/model/prompt/traffic settings are unchanged.

## Architecture and ownership

- `festivalLinker.ts` resolves explicit source evidence to canonical one-off
  events. It never discovers by venue/week alone, creates events/venues,
  approves reviews or writes a public document. Known participant venues,
  exact source ownership and a printed governing date are required for the
  narrow same-source festival-named activity path. Cross-source evidence uses
  its own stricter explicit edition/organizer membership checks.
- `festivalLinkShadowJob.ts` verifies completed processing lock, marker, final
  batch and absent checkpoint, excluding selected-row/dry replay evidence.
  Deterministic dataset IDs, input/policy fingerprints, bounded retries and
  worker generations prevent duplicate claims and stale completion. A changed
  canonical/source revision can requeue the same dataset without replaying
  parser event writes.
- `festival-evidence-extractor.mjs` makes bounded, separate post-parse Luna high
  calls against original captions and ordered galleries. It preserves model
  status, incomplete details, raw output, usage and latency, then performs an
  independent source verification. Missing gallery entries, invented quotes,
  cross-card clocks/venues and unreadable sources hold. No gallery is silently
  truncated or relabeled caption-only. There are at most20 images per captured
  source and two150-second calls per source, with no automatic API retry.
- Printed caption date headings may govern following activity rows until the
  next date heading. Expansion retains one actual contiguous source substring;
  the activity row still owns its title, clock and venue. Separate-image venue
  headings are not yet treated as sufficient scoped evidence automatically.
- `prepare-festival-shadow-registry-readonly.mjs` bootstraps identities only from
  already reviewed, published area events. It preserves verified participant
  IDs/aliases and explicit first-party source bindings. Unknown editions remain
  held. The registry is a starting authority, not automatic approval of every
  activity at those venues.
- `festival-link-shadow-runner.mjs` proves full-run completion before reading
  source evidence, scans all canonical candidates in edition date bounds, and
  records eligible/held/pending outcomes. Paid work requires a durable lease.
  Its only optional Firestore writes target `festival_link_shadow_jobs`;
  public events, venues, reviews and media have no write path in this runner.
  Three paid sources per invocation is a hard bound. Uncaptured sources remain
  explicit gaps; cached responses avoid repeat spend. Scan overflow holds the
  run rather than claiming complete coverage.

The duplicate-investigation chat owned two isolated matcher files from exact
accepted98076a3. Coordinator independently reviewed/integrated its commits,
built the completion/worker/evidence adapter and owns any future deployment.
No frontend change or OTA is needed: Preview01a13d1e already consumes links.
Craig has confirmed the existing festival flow on his iPhone.

## Historical evidence and current limitations

Local artifacts: `functions/artifacts/festival-linker-oct15/`.

The October14 full run was independently proved complete. Its151 unique
snapshots produced six potential source posts for the known Anchor edition;
all other scanned canonical events remain outside membership unless an exact
source claim proves otherwise. Initial no-model shadow execution wrote only
one internal dataset job and reported six evidence gaps, zero event writes.

Two paid source controls used original Tivoli five-image and downtown one-image
galleries. Initial strict capture guards exposed missing document/row-context
contracts. Those responses held; no links or live data were written. Diagnostic
retention was then hardened. First-attempt usage was not retained before that
fix and must not be represented as fully reconciled cost history.

Reusing the retained extraction responses offline, with fresh independent
source verification, preserved ten Tivoli items as deterministic holds and
confirmed five downtown activity transcriptions. This is not a claim that all
five are eligible canonical links; conflicting source clocks and titles remain
the matcher's responsibility. Offline response playback is not additional paid
API work or new API latency evidence. Current raw responses, exact source
captures and per-call usage are retained. Shared image venue/date headings and
missing printed edition identity are explicit remaining coverage work.

## First newly completed full-run procedure

Use the coordinator checkout
`C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script`.
Set `ANCHOR_CREDENTIAL_PATH` to the existing main-checkout credential without
printing/copying it. Build the committed functions, then:

1. Generate a fresh local registry with
   `node firebase/prepare-festival-shadow-registry-readonly.mjs --as-of=2026-10-15 --out=functions/artifacts/festival-linker-oct15/registry.json`.
2. Prove the NEW regular dataset complete. Never use October14 dataset
   `11-wPIfOUWmVwQqpUGUQ3LF36BFDPWuOC` as today's new-run result.
3. Run the shadow runner with explicit new `--file-id`, saved `--registry`,
   a dedicated `--out`, `--persist-shadow-job`, `--max-sources=3` and
   `--execute-evidence`. Reuse the existing parser OpenAI secret only within
   the child process; never echo/store credentials or create a new API key.
4. Review every eligible link AND every gap/held/missing child against source
   captions/galleries, original canonical records and existing approved links.
   A further bounded batch may capture previously uninspected sources; do not
   repeatedly retry cached API errors or unresolved source ambiguities.
5. Record proposed additions/removals, protected human decisions, duplicates,
   coverage, tokens, latency and remaining source limitations. Do not call an
   incomplete report a successful full-inventory audit.

Automatic publication remains OFF until these source-based shadow gates pass.
It is a subsequent implementation/release phase, not an authorization to fake
manual approvals or mutate today's listings from a partial report. Keep the
main parser unchanged during its active run. Use the existing October15 audit
schedule after11a.m.Halifax; do not add a second monitor or earlier messages.

Evidence request format was checked against the official Responses structured
output guidance: https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses .

## Pre-parse verification outcome

Independent coordinator build passed. All831 compiled backend tests passed
(782 prior tests,41 matcher tests,8 completion/lease tests), with zero skips or
failures. The separate capture checks cover omitted galleries, caption drift,
cross-card facts, incomplete responses, shared caption dates and literal title
selection. Owned matcher commits were independently inspected and integrated;
the delegated checkout is clean and read-only after handoff.

The captured complete October14 run does **not** yet pass readiness for live
automatic linking. Latest source playback confirms five downtown activity
transcriptions, but two have no exact canonical match and three existing
canonical records lack the required `sourceUniqueIds` ownership evidence.
Those records remain held; unique-ID prefixes are not silently promoted into
provenance. Tivoli's ten image-only rows remain held because the shared venue/
edition context needs additional verified evidence. Four other potential posts
have not yet received source extraction. The report therefore has zero eligible
links,14 explicit capture gaps and held/pending matcher outcomes. No live event,
review, venue or media changed. This is an incomplete shadow evaluation, not a
successful automatic rollout.

The upcoming regular parse remains on its prior production source/model/prompt
baseline. Today's completed run will supply fresh saved sources and canonical
provenance for the next bounded shadow audit. Do not enable automatic publication
or relax the ownership/source-context gates to make the backtest counts green.
