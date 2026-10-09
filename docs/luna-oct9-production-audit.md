# October 9 Luna production audit and hardening

## Completed regular run

Dataset `1NpfngSPGDDOm9Fb5DcYseMuCe4BdKjGq`, run `73b525a4-d06f-4022-a5f8-c22c7891c367`, processed all 385 source rows from 12:39:27 to 15:01:49 UTC (9:39 a.m.–12:01 p.m. Halifax). Firestore independently showed a completed processing lock, a processed-dataset marker, completed final batch at row 385, and no checkpoint. The batch's `processedRows=361` field lags the authoritative row progress; processed/skipped/invalid counters sum to 385.

Final counters: 48 processed, 116 skipped, 221 invalid, one duplicate, zero processing errors, 59 new event/special records, 25 updated records, 164 snapshots and nine unknown-venue observations. Zero processing errors does not mean zero content errors.

The deployed baseline was parser `977a72a`, release record `2eb6fcb`, common function source hash `76ac783b8f752d5d211c247972e3012840fb8eba`. All three functions were freshly read back ACTIVE before repair. Stage 1 pilot remains 50%, Stage 2 Mini, Stage 3 Luna high for all eligible image posts, GPT-5.2 for image-ineligible Stage 3, Stage 4 Nano low, Stage 5 Nano medium, and legacy fallback disabled.

## Model allocation and review

- Stage 1: 153 eligible image-post evaluations, 85 Luna selections and 68 Mini selections. Luna passed 37 and rejected 48. The 85 evaluations represent 84 distinct source IDs: source `1805887361174800` appeared at rows 130 and 237 and was selected consistently. This was not a worker replay. No confirmed useful post wrongly rejected by Stage 1 Luna was found in the reviewed captions and available galleries. Media availability and small text prevent a claim of perfect recall.
- Stage 3: 69 eligible posts, all 69 selected and actually reaching Luna high. Their final payloads contain 88 items across 43 positive posts; 26 have no final items. Those rows produced 54 new records and 25 updates. Five additional creates came from other paths. A zero source-ID match is not automatically a lost write: venue holds and matching older records are separately tracked.
- Original ordered galleries were downloaded and reviewed alongside captions, snapshots and row logs. Of 303 source image URLs, 299 remained fetchable; row 222's three images and row 224's image were unavailable. Contact sheets establish layout/inventory; disputed details were checked at full resolution. Full intermediate Stage 3/4 objects were not enabled in live snapshots, so some boundaries rely on log previews and final snapshots rather than a complete raw response.
- The [selected source ledger](luna-oct9-selected-source-ledger.md) identifies every selected post, final inventory and write/hold counts. `artifacts/luna-oct9-production-audit/audited-ledger.json` retains captions, ordered galleries, per-stage usage, actual log-derived paths and venue holds for all 164 snapshots. Local raw logs and images are retained at `C:\Users\craig\.codex\luna-oct9-audit`.

## Confirmed defects and repairs

| Source | What happened in production | Hardening and validation |
| --- | --- | --- |
| Mary’s Bake Shoppe, row 335 / `1549619793637990` | Stage 1 correctly accepted the first-time $1.49 day-old bread deal. Later formatting discarded it because the post also announced closures. Ordinary pie/product prices were incorrectly extracted along the way. | Match the named offer to its source clause, including innocuous title suffixes; regular priced products do not inherit eligibility. Tightened extraction prompt. Final no-write replay retains the bread offer and excludes the other products. |
| Bell Aliant, row 198 / `1526976716116913` | Stage 3 kept five activities/classes but excluded eight printed public pool/waterslide access windows as facility hours. | Restore only explicitly dated caption access ranges, preserving each printed window, caption provenance and one-off dates. Stage 4 cannot mutate those deterministic ranges. Final replay has all 13 items with eight access windows. |
| Bell Aliant final timing | Replays exposed “between noon and 4 p.m.” being split into starts, then a separate final resolver reading noon as both endpoints. | Both source schedule parsing and final evidence resolution now handle between/and ranges. Final full-pipeline replay preserves 12:00–16:00. Tests also retain independently listed session times. |
| Island Hill Farm, row 287 / `1140431992044087` | The weekend market was saved on Thursday October 8 because the extractor used the post date as a fallback. | Require a source date anchor, resolve advertised upcoming weekend days, and hold a model-admitted unsupported activity fallback. No-write replay produces October 10 and 11, 10:00–16:00. |
| PEI Marathon, row 51 / `1515399363943565` | A registration-price-change deadline became an event, while actual races lacked start times. | Exclude standalone administrative registration deadlines while preserving races and attendee kit pickup. Replay removes the false deadline; untimed race entries are still held rather than assigned invented starts. |
| Port Charlottetown, row 175 / `1587492483175007` | An initially correct empty extraction was followed by forced ship-call entries; one ship also borrowed its neighbour's arrival time. | Permit empty extraction for logistics, and recognize two-ship-day/Port Visit wording in the final logistics filter. Replays produce no entries; a public cruise-themed concert remains a test control. |
| Robert McMillan Pottery, row 274 / `1667779975261824` | A control replay showed that the ordinary-hours safeguard could reject the offered public studio tour depending on its title. | Distinguish advertised studio/gallery tours from plain store hours and use the advertised visitor access windows. Final replay preserves both October 10/11 tours, 10:00–17:00; plain shop hours still fail. |

Stage snapshots now retain bounded Stage 1/3/4 evidence by default when parse snapshots are enabled. The diagnostic payload is capped at 240,000 UTF-8 bytes and marked if truncated, with existing item/gallery caps. An explicit `ENABLE_PARSE_SNAPSHOT_STAGE_ARTIFACTS=false` still disables this. The ISO date parser also preserves an explicitly printed year instead of interpreting the trailing month/day using the post year.

## Resume, latency and prior repairs

All 385 row starts occurred once. The 403 checkpoint saves never regressed. All 19 worker requests returned HTTP 204; there was no observed overlapping row replay or exhausted resume. Large-row parsing still takes minutes, but the October 6 stalls did not recur.

Stage 4 had 75 calls, median 10.906 s, maximum 64.198 s, 25,920 reasoning tokens. Stage 5 had 60 calls, median 42.960 s, maximum 129.037 s, 244,288 reasoning tokens out of 285,371 output tokens. All reported completed; none reported output-limit exhaustion. The existing Stage 4/5 effort and batching settings were preserved. Stage 5 reasoning remains a separate optimization target.

All 13 October 8 deleted IDs remain absent. The 20 PowerSkating one-offs and two Hunter repairs remain present; PowerSkating has no November 7/8 or December 26 additions. The October 8 Trailside record is now absent after its event date; the audit does not claim that a current omission without evidence of a failed reparse caused its disappearance. The underlying missing-time source still needs enrichment for future shows. The Laura and Don source conflict remains unresolved and untouched.

## Remaining limits and decision

Keep Stage 1 at 50% and Stage 3 at 100%, ship the focused repairs, then validate another regular run before expanding Stage 1. This run supports continued Luna use, not a claim that every source is publishable.

- Several genuine activities have no source-grounded clock time: Vintage's month-long scarecrow walk, Toby's maze/slide, untimed classes, putting access and some workshops. They need trusted hours/booking enrichment or an explicit untimed-event product contract. Do not invent starts to raise recall.
- Art Buds’ supplied crops cut off the schedule details. Two other posts have expired/unavailable source media. These are source-capture limits.
- Stratford's felting poster correctly reads October 24, 2–5 p.m. It was held for `Gertrude Cotton Building`, queue `uv_d54f0f035d5dde2a36e99d5c`; venue resolution belongs to the location-queue task. Other unresolved venues remain queued.
- Legacy end-time defaults remain visible outside the focused source-range repair: the text-only Rxtra “11–4” clinic acquired 21:00, an untimed pancake brunch end became 21:00, and the Bay Fortune booking deadline acquired 00:39. These are downstream inference-policy issues, not evidence that Stage 1 Luna rejected useful content. Record them for the Stage 5 timing work; do not present those ends as printed facts.
- Four false production records are identified for a separate exact, guarded cleanup: two ship visits, the marathon price-change deadline and the Thursday market. Parser prevention does not delete existing records. No live event mutation is authorized by an approval for an older batch.

## Verification

TypeScript build passes. All 567 compiled tests and all 40 Stage 1 evaluation tests passed; the final ISO-date addition also passed its focused checks and was included in a fresh full-suite run. Six original-source no-write API cases were exercised, with repeated runs where they exposed additional regressions. Final decisive results and release readback are recorded in `luna-oct9-hardening-release.md`. Replays use local copies of the original galleries with uploads and Firestore writers disabled; they validate parsing, not live writer deduplication or app adoption.
