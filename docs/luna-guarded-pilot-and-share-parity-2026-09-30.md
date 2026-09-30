# Guarded Luna pilot and private photo-share parity — 2026-09-30

This is a local code and dry-run handoff. No function was deployed, no parser flag was enabled in production, and no event was written to Firestore. The user-supplied wall calendars remain historical photo-share fixtures, not recovered digital posts.

## Routing and rollback

- Scheduled posts: `LUNA_CANARY_ENABLED=true` plus an exact ID in `LUNA_CANARY_POST_IDS` routes a selected post through Luna, with Stage 3 at `high`, full preprocessed images, and the tested literal-source/time rule. Unselected posts use their existing models. The list is bounded to eight IDs; wildcards do not match.
- Four reviewed bands are still exact-post rules. If a source slot/name check fails, the route retries legacy only when the calendar is the first of at most four source images. If the calendar is later in a carousel or the gallery is larger, it records `Luna canary requires source review` and emits no event payload. This hold gets a parse snapshot even when routine snapshots are disabled. A legacy retry that also returns no events becomes the same review hold.
- Private shares: `LUNA_SHARED_CALENDAR_CANARY_ENABLED=true` plus an exact Firebase owner UID in `LUNA_SHARED_CALENDAR_OWNER_UIDS` selects the same Cloud Run OCR base, full-image Luna high calendar prompt, and source-copy rule for that account's calendar image shares. The share route then applies its existing privacy and user-review conversion. If preprocessing fails or Luna extracts no items, it retries the existing share extractor. The account list is also bounded to eight exact UIDs. Both flags default off.
- Temporary analysis uploads are excluded from output media and cleaned up. Original source, gallery, thumbnail, and profile image URLs are excluded from pilot cleanup. Four-band analysis frames continue to map to their original carousel source.
- Rollback is to set the relevant canary flag false and redeploy the saved configuration; if deployed code itself causes trouble, restore the saved pre-pilot Function revision. A flag change does not undo already saved events, so compare write snapshots before and after enabling.

## Paired private-share test

The same `photo-06.jpg` Factory Downtown February 2026 poster was submitted through the private share parser with a frozen February 1 clock. Luna received the existing Cloud Run preprocessed base; the existing GPT-5.2 share path received the original JPEG. This matches the intended live image paths. The input was local, the outputs were dry, and no cloud storage or Firestore write occurred. The first attempted legacy run used an inaccessible local HTTP URL and is excluded because the image fetch returned HTTP 407; the valid paired run sent the JPEG bytes as a test-only data URL.

| Route | Dated extracted shares | Selected source checks | API usage | Estimated Stage 3 API cost |
| --- | ---: | --- | --- | ---: |
| Luna high, preprocessed full image | 49 | Feb 8 watch party retained without invented time; Feb 12 Early Trivia with Darcy, Feb 14/28 Music Bingo with Darcy, and final row retained | 14,310 input, 11,887 output; 14,307 input cache-write tokens | $0.00773 |
| Existing GPT-5.2 share path, original image | 38 | Feb 8 retained; several weekday items attached to Saturday dates; many food-deal cells collapsed; final-row names less faithful | 4,618 input, 6,820 output | $0.10356 |

All 49 Luna results and all 38 GPT-5.2 results stayed private under the frozen current-date fixture. Luna was approximately 13.4 times cheaper for this Stage 3 share comparison. This is an observed token-cost comparison, not a billed invoice or a whole scheduled-post cost. Rates are [Standard API prices for Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) ($0.10 input, $0.125 cache writes, $0.50 output) and [GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2) ($1.75 input, $14 output) per million tokens. Network, Cloud Run, storage, retries, and later review are excluded. The source inventory has 49 dated entries for this poster; that does not establish full title accuracy. Luna read the faint Feb 28 DJ as “Laey,” which still needs source verification.

The live private-share path is not the scheduled post's five-stage parser. It now has an opt-in route sharing image preprocessing and Stage 3 prompt/model settings, then retains the privacy-specific conversion. This is the appropriate common extraction core; forcing private shares through the entire scheduled-post pipeline would discard legitimate untimed private records and change publication rules.

## Verification and remaining gate

- Functions TypeScript build passed. The focused parser image/provenance/fallback tests passed (35), and targeted private-share calendar tests passed (5).
- The full existing `sharedEventParser.test` suite had two date-sensitive failures unrelated to these changes on September 30; they expect June/September 2026 events to remain current. The targeted calendar/private-share tests passed.
- A local exact-post smoke run completed all five Luna stages on a selected Cornfest card and kept the unselected row on its configured models. A forced missing-slot second-image carousel run logged `Luna canary requires source review`, retained the four frame-to-source mappings, and produced zero final events. Evidence: `artifacts/beer-garden-trial/luna-band-v1-carousel-dryrun-guarded-followup.json`.
- Automatic row-boundary detection is still unproved. The four-band route requires reviewed crop and cut coordinates. The March Factory poster has conflicting year clues and remains held.
- No broad production switch is recommended yet. Enable a small exact-post and exact-owner pilot only after reviewing selected source IDs, saved configuration, snapshot monitoring, and the forced-hold result. Then compare source-grounded final write payloads, gallery links, skipped rows, and actual usage before expanding.
- Deployment is deferred. The live checkout is on `codex/address-normalization-hardening-20260807` at `fac560d` with unrelated dirty changes, while this tested parser candidate is on `codex/luna-parser-cost-trial` based on `fe1e770`. The backend four-band helper is in another managed worktree. A safe narrow deploy needs an isolated release assembly from the accepted candidate, a captured pre-deploy Function revision/configuration, a check that no large parse is active, and the codebase-qualified dry run from the deployment skill. Deploying the live checkout or all trial files as-is would not match this tested pilot.

Evidence: `artifacts/calendar-heldout-photos-2026-09-30/eval/photo-06/shared-luna-high-pilot-dryrun.json`, `shared-legacy-pilot-dryrun.json`, and their `shared-*-run-2.log` logs; `functions/scripts/luna-shared-calendar-pilot-dryrun.mjs`. The corrected source inventory is in `artifacts/calendar-heldout-photos-2026-09-30/source-inventory-remaining-four.md`.
