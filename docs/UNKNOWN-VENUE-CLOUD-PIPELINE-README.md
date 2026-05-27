# Unknown Venue Cloud Pipeline (AI Handoff README)

## Purpose

This document explains the cloud-only unknown venue pipeline that replaces the legacy Apps Script unknown-venue flow.

This feature exists to:

- catch venues that parsing cannot match
- queue them in Firestore
- generate resolver suggestions (existing venues, aliases, Google Places, optional Apify)
- send manual review emails
- finalize to an existing venue or create a new one
- append resolved Facebook URLs to `PEI Restaurants Full.txt` in Google Drive (idempotent)

## Scope (important)

- Target runtime is cloud only:
  - Firebase Functions v2 (`functions/src`)
  - Cloud Run backend email bridge (`gathr-backend`)
- Apps Script is legacy reference only and is not part of the new production flow.

## Current State (what is implemented)

Implemented and deployed:

- Firestore unknown venue queue (`unrecognized_venues`)
- Queue writes from the cloud parsing pipeline (`rowProcessor`)
- Resolver worker (existing venue matching + alias rules + Google Places + optional Apify stub path)
- Manual review email notifications via backend email bridge
- Email action handling (`resolve_existing`, `create_new`, `ignore`)
- Idempotent finalization (repeat clicks are safe)
- Firestore venue alias updates (`aliases`, `aliasesNormalized`)
- Google Drive append to `PEI Restaurants Full.txt` with duplicate prevention
- Mobile-friendly status page for email actions (`success`, `already applied`, `error`)
- Short-link wrapper for email actions (`t=<shortToken>`) with legacy long-link fallback support

## Collections / Data Model

### `unrecognized_venues`

Queue documents for unmatched venues found during parsing.

Key fields used in practice:

- `establishment`
- `establishmentNormalized`
- `status`
- `occurrences`
- `cityHint`, `provinceHint`
- `aliasCandidates`
- `sourceTypes`
- `sampleEvents`
- `suggestedMatches`
- `resolvedVenueId`
- `resolvedBy`
- `resolvedAt`
- `finalization` (includes selected candidate details and Drive append result)
- `testMode`

Statuses (see `functions/src/types/index.ts`):

- `pending`
- `lookup_running`
- `candidate_found`
- `manual_review`
- `resolved_existing`
- `created_new`
- `ignored`
- `failed`

### `venues`

Venue documents now support alias storage for better matching:

- `aliases`
- `aliasesNormalized`

This is required for handling name variants like:

- `Charlottetown Seaport` -> `Port Charlottetown`

### `unknown_venue_action_tokens`

Short-link token documents used by the backend email action route.

- Stores server-side payload for email links
- Enables short URLs like `.../unknown-venue-action?t=<token>`
- Old long signed URLs are still supported for backward compatibility

## End-to-End Flow

1. Parser finds an unmatched venue in cloud processing.
2. `rowProcessor` queues/upserts a Firestore doc in `unrecognized_venues`.
3. Resolver worker processes pending docs and generates suggestions from:
   - existing venue exact/fuzzy matching
   - alias candidates (static + venue aliases)
   - Google Places
   - Apify (optional; currently feature-flagged)
4. If manual review is required, Functions calls backend email bridge.
5. Backend sends an email with review buttons.
6. User clicks an action link:
   - `Yes - Alias of this Venue` -> `resolve_existing`
   - `Create New Venue from this candidate` -> `create_new`
   - `Ignore` -> `ignore`
7. Backend action route validates token, calls Functions finalizer endpoint, and renders a result page.
8. Functions finalizer:
   - updates queue status
   - updates aliases on existing venue or creates a new venue
   - attempts Drive append for selected Facebook URL (deduped)
9. Repeat clicks return `alreadyApplied` and do not duplicate writes.

## Services / Endpoints

### Firebase Functions (`functions/src/triggers/unknownVenue.ts`)

- `listUnrecognizedVenues` (HTTP)
- `processUnrecognizedVenues` (HTTP)
- `finalizeUnrecognizedVenueTrigger` (HTTP)
- `scheduledUnknownVenueResolver` (Scheduler, every 5 min)

### Cloud Run backend (`gathr-backend/backend/routes/v2/admin.js`)

- `POST /api/v2/firestore/admin/unknown-venue-email`
  - email bridge called by Functions
- `GET /api/v2/firestore/admin/unknown-venue-action`
  - review link landing/action route
  - supports:
    - short token link (`t=...`)
    - legacy long signed link (`docId`, `action`, `venueId`, `candidateIndex`, `exp`, `token`)

## Key Environment Variables

### Functions (unknown venue pipeline)

- `UNKNOWN_VENUE_PIPELINE_ENABLED`
- `UNKNOWN_VENUE_TEST_MODE`
- `UNKNOWN_VENUE_TEST_ALLOWLIST`
- `UNKNOWN_VENUE_RESOLVER_ENABLED`
- `UNKNOWN_VENUE_RESOLVER_BATCH_LIMIT`
- `UNKNOWN_VENUE_AUTO_RESOLVE_EXISTING`
- `UNKNOWN_VENUE_AUTO_CREATE_ENABLED`
- `UNKNOWN_VENUE_AUTO_CREATE_CONFIDENCE`
- `UNKNOWN_VENUE_APIFY_ENABLED`
- `UNKNOWN_VENUE_APIFY_ACTOR_ID`
- `UNKNOWN_VENUE_APIFY_RESULTS_LIMIT`
- `APIFY_TOKEN`
- `UNKNOWN_VENUE_EMAIL_WEBHOOK_URL`
- `UNKNOWN_VENUE_EMAIL_WEBHOOK_KEY`
- `PEI_RESTAURANTS_GDRIVE_FILE_ID`

### Resolver Throughput Note

As of May 27, 2026, production intentionally uses:

- `UNKNOWN_VENUE_RESOLVER_BATCH_LIMIT=15`
- `scheduledUnknownVenueResolver` still runs every 5 minutes

Operational meaning:

- The resolver still sends one manual-review email per unknown venue; the batch size only changes how quickly those emails arrive.
- `15` is suitable for normal daily volume and for moderate catch-up bursts.
- A one-time backlog catch-up of roughly 200 old `lookup_running` docs drained successfully after raising the scheduled batch size from `3` to `15`.
- Do not casually raise this to `25`: a manual 25-item batch hit the 300-second upstream timeout, even though some docs still moved to `manual_review` before the timeout.
- If another large backfill creates a big backlog, prefer controlled single-doc/manual waves with limited concurrency over pushing the scheduled batch size past `15`.

### Backend (email bridge / action route)

- `BASE_URL`
- `FIRESTORE_UNKNOWN_VENUE_FINALIZE_URL`
- `UNKNOWN_VENUE_EMAIL_BRIDGE_API_KEY` (or `ADMIN_API_KEY` fallback)
- `UNKNOWN_VENUE_EMAIL_SHORT_LINKS_ENABLED`

## Production-Safe Wet Run Mode

Use test mode to avoid sending all live unknown venues through the new pipeline while validating.

Functions flags used:

- `UNKNOWN_VENUE_PIPELINE_ENABLED=true`
- `UNKNOWN_VENUE_TEST_MODE=true`
- `UNKNOWN_VENUE_TEST_ALLOWLIST=Charlottetown Seaport|The Factory`

Behavior:

- normal parsing continues
- only allowlisted unknown venues are queued in the new cloud pipeline

## Manual Review Email UX (Current Behavior)

Implemented:

- clear action result page on desktop/mobile browser
- idempotent repeated clicks (`Action Already Applied`)
- duplicate prevention messaging for Drive append results

Known limitation:

- Gmail mobile / in-app browser can fail to open the button on simple tap
- long-press -> `Open link` / `Open in browser` is more reliable

Important:

- This is not a tap-handler issue in our HTML
- Email clients restrict JS, so we cannot fix this with `onclick`/touch code

## Why the Mobile Email Tap Can Still Fail

Likely causes:

- Gmail mobile / in-app browser behavior
- link rewriting / preview behavior
- email client handling of action links (even after short-link change)

What we already improved:

- shortened unknown-venue action links using `t=<shortToken>`
- legacy fallback support preserved
- clearer result pages
- repeat-click idempotency

## Drive Append Behavior (`PEI Restaurants Full.txt`)

Finalization attempts to append the selected Facebook URL to the Drive file configured by:

- `PEI_RESTAURANTS_GDRIVE_FILE_ID`

Duplicate prevention:

- compares normalized URL variants internally
- writes the full URL to file
- repeated finalization does not duplicate lines

Important domain-specific note:

- `DowntownCharlottetownInc` is a valid aggregator page and should not be removed from `PEI Restaurants Full.txt`
- It is separate from the canonical `Port Charlottetown` page

## Wet Run Notes (Charlottetown Test Cases)

### `The Factory` (Charlottetown)

- Existing venue match was correct
- Email action `resolve_existing` worked
- No duplicate venue created
- Drive append dedupe behaved correctly on repeated clicks

### `Charlottetown Seaport` -> `Port Charlottetown`

- Initially surfaced a stale Facebook URL from legacy venue data (`DowntownCharlottetownInc`)
- Existing venue record was corrected in Firestore to canonical page:
  - `https://www.facebook.com/portcharlottetown`
- Resolver was re-run and new email showed the correct URL
- Manual review then resolved successfully to the existing venue

## Recent Hardening Updates (February 23-24, 2026)

This section captures the major wet-run improvements completed after the initial rollout doc.

### Manual review process rule (operator safety)

- Manual review remains the default.
- Do not trigger `create_new`, `resolve_existing`, or `ignore` programmatically unless the operator explicitly asks.
- Resolver-only tests are allowed (queue + resolve + email) when explicitly requested.

### Queue / hinting / matching improvements

- Queue-time hint inference now uses post text / OCR (`description`) plus aggregator Facebook venue fallback.
- Resolver now derives geo hints from queued sample context (`aggregatorName`, `eventName`, `descriptionPreview`) and uses them in scoring/search.
- Added broad Google Places fallback (not restaurant-only) when restaurant typed search misses.
- Added parenthesized address/location stripping before existing/alias/fuzzy matching (example: `Venue (5 Church Ave, Souris, PE)` -> `Venue` for matching only).
- Added alias for `St. Paul's Church` -> `St. Paul's Anglican Church`.

### Candidate quality improvements

- Places suggestions can extract a Facebook URL from the venue website (best-effort website footer/social link extraction).
- Apify filtering was tightened (confidence + geography) to reduce noisy Facebook suggestions.
- External candidates (`places` / `apify`) now link to existing Firestore venues by `facebookUrl`, so emails can show alias actions automatically.
- Existing-linked suggestions now merge duplicate evidence (`exact`, `alias`, `apify`) into one email card.
- Resolver now uses `sampleEvents[].aggregatorFacebookUrl` as a guarded existing-venue signal (requires name containment and locality match) so shorthand names from the same page can resolve as aliases.
- Places/Apify scoring now applies a narrow locality + token-containment boost for cases like `Waterfront Cafe` -> `Summerside Waterfront Cafe ...` (without lowering global confidence floors).

### Manual review email / UX improvements

- Email renderer decodes URL-encoded metadata values (website / phone / placeId) before display.
- Email cards now show Places metadata (`website`, `phone`, `placeId`) and an explicit "No Facebook URL found..." message for Places-only candidates.
- Email cards now hide `Create New Venue From This Candidate` when a suggestion already has `venueId`.
- Merged email cards preserve evidence lines, for example:
  - `Evidence: exact (100%) | alias (100%)`
- Unknown-venue action success page (`create_new`) can now show a manual button to start a `1-day` Facebook posts scrape for the newly created venue (only shown when the create result includes a Facebook URL).

### Finalization safety and enrichment improvements

- `create_new` now hydrates venues with Places metadata (city, province, postalCode, latitude, longitude, category, Google place metadata, rating counts, hours when available).
- `resolve_existing` now enriches missing venue metadata from the selected suggestion and sibling evidence suggestions pointing to the same venue (`website`, `phone`, `lat/lng`, category, Places metadata when present).
- `create_new` duplicate preflight (server-side safety):
  - blocks if selected candidate already links to an existing `venueId`
  - blocks if selected `facebookUrl` already exists in Firestore
- Backend action page now shows a clear warning when `create_new` is blocked (instead of a generic failure page), instructing the operator to use the green alias button.
- `create_new` finalize result now returns the created venue's `facebookUrl` (when available), enabling post-success follow-up actions in the backend confirmation page.
- `create_new` now merges sibling suggestion metadata when the selected card and another card clearly refer to the same candidate (same Facebook URL or same address + similar name), so selecting an Apify card can still inherit Places metadata like `placeId`, coordinates, phone, website, and ratings.
- `resolve_existing` and `create_new` now automatically enqueue targeted row replays for sampled source rows (`sampleEvents[].fileId + rowIndex + parserMode`) using the new `processDatasetSelectedRows` Cloud Tasks trigger.
- Unknown-venue action success pages now report replay queue status (for example, `Queued replay of 2 rows across 1 file`).
- Places detail enrichment now returns `location` / `types` / `businessStatus`, and parser hours-based Google Places refresh writes venue coordinates when available (prevents venues from gaining `googlePlaceId`/hours but still missing map coords).
- Unknown-venue email action links now use top-level backend routes (`/api/unknown-venue-action`, `/api/unknown-venue-post-scrape`) that redirect to the v2 admin handlers. This mirrors the moderation email link style and is intended to improve iOS/Gmail behavior (browser handoff instead of in-app webview handling).

### Manual post-scrape trigger (operator-controlled)

- Added a new Functions admin endpoint:
  - `startVenueFacebookPostsScrape` (region `northamerica-northeast2`)
- Purpose:
  - manually start an Apify `Facebook Posts Scraper` run for a newly created venue's Facebook URL from the unknown-venue action success page
- Default actor:
  - `KoJrdxJCTtpon81KY` (`apify/facebook-posts-scraper`)
- Default input behavior:
  - `startUrls: [{ url: <facebookUrl> }]`
  - `onlyPostsNewerThan: "1 day"`
  - `resultsLimit: 6`
  - `captionText: false`
- The backend success page route (`/api/v2/firestore/admin/unknown-venue-post-scrape`) signs the click and proxies to the Functions endpoint with admin auth.
- This is still manual and operator-triggered (no automatic post scrape on `create_new`).
- Scrape processing after run start still depends on the actor's existing Apify integrations/webhooks (Drive export + webhook to `apifyWebhook`) being configured.

### Page-submission approval -> venue discovery -> scrape onboarding (new)

- Page submissions approved from `profile.tsx` can now follow a manual, staged onboarding flow:
  1. `Approve` page submission (adds page URL to `PEI Restaurants Full.txt`)
  2. `Run Venue Discovery For This Page` (recommended)
  3. Receive the normal unknown-venue review email (`Alias` / `Create New`)
  4. If `Create New` is chosen, use the existing success page button `Start 1-Day Facebook Post Scrape`
- New moderation follow-up route on the backend:
  - `/api/moderate-submission-venue-discovery`
  - It calls the Functions unknown-venue resolver endpoint with a `pageSubmission` payload (synthetic queue + resolve) and returns a confirmation page while the review email is sent.
- `processUnrecognizedVenues` (Functions) now supports a `pageSubmission` mode:
  - derives a venue/page display name from the approved Facebook page URL
  - queues an `unrecognized_venues` doc with `aggregatorFacebookUrl` set to the approved page
  - immediately runs resolver and sends the normal manual-review email when viable suggestions exist
- Page-submission venue discovery now seeds the Facebook Search Scraper with the exact approved Facebook page URL (when available) instead of relying only on the derived page name. This is important for generic names like `The Club`.
- Page-submission venue discovery now forces the Apify suggestion pass for that specific resolver run (even if global queued auto-Apify suggestions remain disabled). This preserves cost control while making page onboarding reliable for generic names.
- Page-submission venue discovery now always injects a suggestion built from the exact approved Facebook page URL (the submitted source page) so `Create New` can use the approved URL even when Facebook Search Scraper returns ambiguous/legacy page variants.
- Page-submission venue discovery no longer force-keeps token-only Apify search matches for the page-submission path (this could select a wrong page with a similar name).
- Apify unknown-venue dataset fetches now retry briefly when the actor run returns but the dataset items endpoint is temporarily empty (prevents false `0 suggestions` outcomes when the actor succeeded but dataset rows are not yet visible).
- Moderation approval/duplicate pages now intentionally show only:
  - `Run Venue Discovery For This Page` (required next step in the staged flow)
- `Start 1-Day Facebook Post Scrape` is intentionally deferred until after the unknown-venue review email is completed and `Create New` lands on the existing unknown-venue success page.

### Page-submission flow hardening / regression fixes

- Fixed duplicate approval emails caused by multiple Cloud Run revisions/instances running the `pageSubmissions` Firestore snapshot listener concurrently:
  - listener now claims pending submissions (`approvalEmailSendInProgress`) before sending the moderation email
  - duplicate instances skip if the claim already exists or `approvalEmailSentAt` is set
- Legacy page-submission Drive append path (`server.js`) hardened:
  - Shared Drive-safe file search (`supportsAllDrives`, `includeItemsFromAllDrives`, `corpora=allDrives`)
  - explicit service-account Drive auth fallback for writes
  - prefers known `PEI Restaurants Full.txt` file ID when available
- Added a lightweight public scrapeability precheck for Facebook page submissions:
  - backend JSON endpoint: `/api/facebook-page-scrapeability-check?url=<facebook-url>`
  - runs a logged-out/public fetch probe against the Facebook page URL and detects common non-public/error responses (for example `This content isn't available right now`)
  - returns a warning flag (`likely_not_public`) without blocking submission automatically
- Tuning note (Feb 2026): scrapeability precheck now uses a minimal logged-out probe header (`User-Agent: Mozilla/5.0`) to avoid Facebook’s generic 400 bot-gate responses.
- Classification guardrail (Feb 2026): login-page metadata (`/login` canonical/OG) is treated as non-page metadata. A probe that redirects to login and has no real page metadata now emits `likely_not_public`; real page OG/canonical still emits `public_accessible`.
- URL hygiene guardrail (Feb 2026): moderation normalization now rejects non-page Facebook paths (`/login`, `/checkpoint`, `/share`, etc.) so resolver output cannot collapse into `facebook.com/login`.
- `profile.tsx` now calls the scrapeability precheck before creating a `pageSubmissions` doc:
  - if the page looks non-public to scrapers, the submitter sees a warning (`Cancel` / `Submit Anyway`)
  - warning includes the probe result / HTTP status when available
- Moderation approval/duplicate/venue-discovery/start-scrape pages now also surface the same scrapeability warning banner (when the stored submission precheck indicates `likely_not_public`)
- `profile.tsx` Facebook URL resolver now correctly preserves `facebook.com/people/<name>/<id>` URLs (and `profile.php?id=...`) instead of collapsing to `https://www.facebook.com/people`
- Duplicate page submissions now persist daily-count behavior across app reloads:
  - duplicate attempts are stored in `pageSubmissions` with `status: duplicate` (they do not trigger moderation emails)
- Unknown-venue queueing now derives better aggregator names from `facebook.com/people/<name>/<id>` source URLs (e.g. `The Club` instead of `people`), improving resolver hints.

### Test-mode and parser fixes

- `UNKNOWN_VENUE_TEST_ALLOWLIST` parser now supports comma-separated entries that contain commas inside parentheses (for example `Souris Show Hall (5 Church Ave, Souris, PE)`).
- Added a conservative pre-queue non-venue label heuristic to suppress obvious activity/program labels before they enter `unrecognized_venues` (examples: `Aquafit`, `Lane swim`, `Leisure pool`, `All pools`, `Toddler Pool`, `Gen XX`).
- Fixed scheduled resolver queue starvation: it now queries actionable statuses directly (`pending`, `candidate_found`, `failed`) instead of scanning the oldest docs across all statuses and filtering in memory, which could skip new pending docs when `UNKNOWN_VENUE_RESOLVER_BATCH_LIMIT` was small.
- Fixed a scheduler cost leak: `scheduledUnknownVenueResolver` no longer auto-retries `failed` unknown venues. Reprocessing failed docs caused repeated Apify search runs (and spend) on every scheduler cycle. Failed docs now require manual retry/requeue.
- Manual-review-first behavior preserved:
  - `UNKNOWN_VENUE_CREATE_NEW_FB_LOOKUP_ENABLED=false`
  - Apify can still be used for resolver suggestions in emails.
  - Global queued auto-Apify suggestions remain gated (safer default), while page-submission venue discovery explicitly opts in for its own resolver run.

### Case-study outcomes from wet-run testing

- `Copper Bottom Brewing`
  - Correct Facebook URL surfaced from website extraction (`https://www.facebook.com/copperbottombrewing`)
  - `create_new` created venue and Drive append dedupe prevented duplicate line in `PEI Restaurants Full.txt`
  - Existing Copper Bottom venue was later backfilled with richer Places metadata (city/province/postal/coords/category/googlePlaceId/rating/hours)
- `Samuel's / Samuels Coffee House`
  - Places candidate initially selected in one scripted test (operator later corrected FB URL manually)
  - Confirmed valid Apify candidate existed (`https://www.facebook.com/SamuelsCoffee/`)
  - Venue was patched with confirmed Facebook URL after the mistaken test action
- `O'Brien's Social Bar & Kitchen (Red Shores Charlottetown)`
  - Added alias matching so it resolves to existing `Red Shores`
- `St. Paul's Church`
  - Resolved to existing `St. Paul's Anglican Church` via manual review alias path
  - Drive append dedupe confirmed
- `Souris Show Hall (5 Church Ave, Souris, PE)`
  - Correct page was found by Apify
  - Parenthesized address stripping + FB URL linking now produce alias-friendly suggestions
  - Existing venue (`slug_sourisshowhall`) was confirmed to already exist and was backfilled from stored suggestions (website filled, no duplicate venue created)
- `Waterfront Cafe` (from `Summerside Waterfront Cafe` page)
  - Initial resolver retries failed despite finding the correct Places result because confidence scored `0.49268` (< `0.55` floor)
  - Fixed via guarded aggregator-page URL existing match + locality-aware token-containment boost
  - Re-test resolved to `manual_review` and sent alias email (`existingSuggestions=1`, `placesSuggestions=1`)
- `Red Shores Summerside` (posted by sister page `redshoresPEI`)
  - Correctly modeled as a separate venue (`Red Shores Summerside Raceway`) via `create_new`
  - Do not alias to `redshoresPEI` / Charlottetown just because the aggregator page is shared
  - Valid pattern: separate physical venue with Places data (`googlePlaceId`, address, coords, website/phone) but no venue-specific Facebook page
  - Future enhancement (optional): add `aggregatorFacebookUrls[]` / `brandFacebookUrls[]` to capture shared parent-page relationships without misusing `facebookUrl`
- `The Club` (page-submission onboarding test; `people/<name>/<id>` URL)
  - `Approve -> Run Venue Discovery -> unknown-venue email -> Create New -> Start 1-Day Facebook Post Scrape` flow now works end-to-end
  - Venue discovery uses the exact approved Facebook page URL for Apify search (instead of only the derived generic name `The Club`)
  - Parser created events successfully after the 1-day scrape; API returned those events correctly
  - Map visibility issue was traced to missing venue coordinates on the newly created venue (events existed but `latitude/longitude` were null, so the map hid them)
  - One-off coordinate backfill restored map visibility for the test venue; code was also patched so future venue enrichments are less likely to miss coordinates in similar flows
- `The Old Triangle Sydney` (page-submission onboarding; vanity URL to legacy `/pages/.../<id>` output)
  - Initial venue discovery failed because Apify returned `0` rows during a successful actor run (dataset-read timing race)
  - Then a subsequent venue-discovery test incorrectly selected an unofficial legacy Facebook page because the search scraper returned a similar-name page (`/pages/.../<id>`) and the page-submission fallback over-trusted token matching
  - Fixed by always injecting the exact approved Facebook page URL as a candidate and removing token-only force-keep behavior for page-submission discovery
  - Also hardened Apify dataset item fetching with short retries to avoid intermittent empty dataset reads after successful actor runs
  - Follow-up validation showed the official page (`https://www.facebook.com/TheOldTriangleSydney`) is not publicly accessible to logged-out users (`This content isn't available right now` in incognito mode)
  - This explains why Facebook Search Scraper / Contact Info Scraper were unreliable or returned `not_available`, and why direct server-side HTML metadata fetches only returned a generic Facebook error page (no `og:title` / canonical metadata)
  - Practical rule: if a page is not visible while logged out, treat scraper failures as a Facebook visibility/privacy constraint (not a resolver bug). Use Places/manual venue creation if needed, but expect automated FB scraping to fail until the page is public

## Deploy / Test Playbook (Exact Commands Used)

### Functions deploy (unknown venue resolver/finalizer changes)

From `functions/`:

```bash
npm run build
firebase deploy --only functions:gathr-functions --project gathr-migrated
```

Notes:

- `firebase.json` is inside `functions/`, so deploy from that directory.
- This reloads `functions/.env` values used at deploy time.
- This deploy now also includes the `processDatasetSelectedRows` task trigger used by unknown-venue finalization row replays.

### Backend deploy (unknown venue email UI/action page changes)

Syntax check from repo root:

```bash
node -c gathr-backend/server.js
node -c gathr-backend/backend/routes/v2/admin.js
```

Deploy to the active email backend region (`northamerica-northeast1`, host suffix `-nn`):

```bash
gcloud run deploy gathr-backend --source . --region northamerica-northeast1 --project gathr-migrated --quiet
```

### Important region/host gotcha (resolved during wet run)

- There are two `gathr-backend` services in this project (different regions):
  - `northamerica-northeast1` -> `https://gathr-backend-6ju7yi5g2a-nn.a.run.app` (this is the one used by unknown-venue review emails)
  - `northamerica-northeast2` -> `https://gathr-backend-6ju7yi5g2a-pd.a.run.app`
- Unknown venue email webhook in `functions/.env` must point to the `-nn` host:
  - `UNKNOWN_VENUE_EMAIL_WEBHOOK_URL=https://gathr-backend-6ju7yi5g2a-nn.a.run.app/api/v2/firestore/admin/unknown-venue-email`
- Deploying backend changes to `northamerica-northeast2` only will not change review emails.
- Recent page-submission approval / moderation changes are in `gathr-backend/server.js` (same Cloud Run service, same region).

### Useful verification commands

List Cloud Run services by region:

```bash
gcloud run services list --region northamerica-northeast1 --project gathr-migrated --format="table(metadata.name,status.url,status.latestReadyRevisionName)"
gcloud run services list --region northamerica-northeast2 --project gathr-migrated --format="table(metadata.name,status.url,status.latestReadyRevisionName)"
```

List Functions URLs (useful when adding new admin proxy endpoints):

```bash
firebase deploy --only functions:gathr-functions --project gathr-migrated
```

Notes:

- The new `startVenueFacebookPostsScrape` endpoint may be shown as a `cloudfunctions.net` URL by Firebase CLI.
- Backend route fallback now resolves this using:
  - `https://northamerica-northeast2-<PROJECT_ID>.cloudfunctions.net/startVenueFacebookPostsScrape`
- You can also set an explicit backend env var if needed:
  - `FIRESTORE_UNKNOWN_VENUE_POST_SCRAPE_URL=<full function URL>`

### Resolver-only email test (no finalization action)

From `functions/`:

```bash
node tmp/queue_single_unknown_email.js "Souris Show Hall (Souris, Prince Edward Island)" 141 1fQNRn-t1s6XQUdDKdglkCcJ5iO7RO-8b PE Souris
```

What this does:

- queues/updates one unknown venue doc (test mode allowlist path)
- runs resolver
- sends manual review email (if doc is not in terminal status)
- does not click any manual-review action

## Rollback / Revert Notes

### 1. Roll back short-link email behavior (keep everything else)

If the short-link email change causes issues, disable it with env only (no code rollback):

```bash
gcloud run services update gathr-backend \
  --region northamerica-northeast1 \
  --project gathr-migrated \
  --update-env-vars UNKNOWN_VENUE_EMAIL_SHORT_LINKS_ENABLED=false \
  --quiet
```

Result:

- new emails return to legacy long signed URL links
- old short-link and legacy links remain supported by backend route code

### 2. Emergency backend revision rollback

If a full backend rollback is needed:

```bash
gcloud run services update-traffic gathr-backend \
  --region northamerica-northeast1 \
  --project gathr-migrated \
  --to-revisions <previous-revision>=100 \
  --quiet
```

### 3. Disable the new unknown-venue cloud pipeline (Functions)

If needed during incident response:

- set `UNKNOWN_VENUE_PIPELINE_ENABLED=false`
- optionally set `UNKNOWN_VENUE_RESOLVER_ENABLED=false`

### 4. Reverting a Firestore venue data patch

Before manual production data fixes, create a local JSON backup snapshot of the doc fields.

Example used during Port Charlottetown fix:

- `backups/port-charlottetown-venue-before-*.json`

This allows restoring `facebookUrl` / `pageurl` and other fields if the patch is wrong.

## Potential Enhancements (Recommended Next)

### Mobile email reliability (highest UX impact)

1. Two-step email action flow (recommended)
- email link opens a GET confirmation page
- actual state-changing action happens on POST from that page
- reduces risk from email preview/scanner/prefetch behavior
- usually behaves better in mobile webviews

2. Custom domain for review links
- improves trust and may improve some mail client behavior
- not a full fix by itself

3. Add explicit `Open in browser` fallback links in email (already partially mitigated by raw links)

### Resolver quality / false positives

1. Suppress low-value fuzzy suggestions when an exact existing match exists
- Example: Seaport exact match plus airport fuzzy candidate

2. Add stronger scoring with city/address token weighting

3. Add source-aware candidate grouping
- existing venue vs places vs apify clearly separated in email

4. Hide `Create New Venue` button for candidates already tied to an existing `venueId`
- completed (February 24, 2026)

5. Filter obvious non-venue activity labels before queueing (`Aquafit`, `Lane swim`, etc.)
- completed (February 24, 2026)

### Apify cost control and reliability

1. Keep Apify disabled by default in early rollout
2. Enable only after exact/alias/Places fail
3. Run a single actor path (current direction) with strict result caps
4. Cache negative results / repeated misses
5. Add per-venue retry cooldown and budget counters

### Operator experience

1. Admin UI for queue review (instead of email-only)
2. Queue filters by status/source/confidence
3. Bulk actions for repeated alias confirmations

## AI Handoff Notes (for future agents)

- Do not reintroduce Apps Script into this pipeline; it is legacy reference only.
- Keep manual review default until confidence is proven in production.
- Preserve idempotency of finalize actions and Drive appends.
- Treat `PEI Restaurants Full.txt` as append-only with dedupe; do not remove known good aggregator pages without explicit user approval.
- If changing email link security or URL format, preserve backward compatibility with older emails where possible.
- Before patching production venue data, check for existing URL collisions in `venues`.

## Quick Verification Checklist (after changes)

1. Queue doc appears in `unrecognized_venues`
2. Resolver moves doc to `manual_review`
3. Email sent (`notificationSent: true`)
4. Email action route returns success or `already applied`
5. Queue doc updates to final status
6. Venue aliases / canonical URL are correct
7. Drive append result is correct (`appendedCount` or `skippedExistingCount`)
8. If `create_new` created a venue with `facebookUrl`, success page optionally shows `Start 1-Day Facebook Post Scrape` and starts an Apify run when clicked
9. For approved page submissions, approval success page can trigger `Run Venue Discovery For This Page`, which should send a normal unknown-venue review email before scraping
