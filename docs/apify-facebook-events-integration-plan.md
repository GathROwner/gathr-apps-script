# Apify Facebook Events Integration Plan

## Current Verified State

- Apify actor: `apify/facebook-events-scraper`
- Console actor id observed in Apify: `UZBnerCFBo5FgGouO`
- Current Drive export folder: `Apify Uploads`
- Current Drive export folder id: `1CiAw97ur95UVAWWLfmcY3ERbjxMrK7Ij`
- Existing production flow: Apify actor run finishes, Apify exports `APIFY Dataset.xlsx` to Drive, `apifyWebhook` finds the exported file, then enqueues `processDatasetResume`.
- Active integration branch: `codex/apify-facebook-events-integration`
- Deployed test cap: `FACEBOOK_EVENTS_DATASET_ROW_LIMIT=4`
- Deployed past-event guard: `FACEBOOK_EVENTS_PAST_GRACE_HOURS=12`

## Initial Safe Path

1. Keep the existing parser/write pipeline and Cloud Run task queue.
2. Add a small admin trigger to start the Facebook Events actor with `maxEvents` capped at `4` while testing.
3. Explicitly map the Facebook Events actor id to scraper type `events`.
4. Tighten Drive matching so the webhook can use actor run timing and optional Drive folder scoping.
5. Normalize Facebook Events rows before the shared parser sees them.
6. Run one tiny Charlottetown PEI scrape and inspect the Drive export and parse snapshots.

## Dataset Shape Review

The latest posts export inspected from Drive was `APIFY Dataset.xlsx`, created `2026-05-18T12:39:58.208Z`, with 320 rows and about 2,000 columns. The important posts columns are a small subset of that file:

| Parser field | Posts export column | Example content |
| --- | --- | --- |
| `text` | `text` | Post caption/body text |
| `sharedPostText` | `sharedPost/text` | Shared post caption when present |
| `facebookUrl` | `facebookUrl` | Page/profile URL currently used by the posts flow |
| `topLevelUrl` | `topLevelUrl` | Post permalink when present |
| `userName` | `user/name` | Facebook display name |
| `pageName` | `pageName` | Page handle/name |
| `timestamp` | `time` / `timestamp` | Post publish time |
| `mediaUrls` | `media/*/photo_image/uri` and related media image columns | Post image URLs |
| `ocrText` | `media/*/ocrText` | Facebook image alt/OCR text |

The Facebook Events actor output uses a different, much cleaner shape. The first adapter pass maps it into the shared parser row contract:

| Parser field | Events export column(s) | Notes |
| --- | --- | --- |
| `uniqueId` | `id` | Facebook event id |
| `sharedPostText` | `name` | Event title |
| `text` | `dateTimeSentence`, `utcStartDate`, `duration`, `location/name`, `address`, `organizedBy`, `ticketsInfo/*`, `externalLinks/*`, `description` | Built into a structured text block so the existing parser gets event context beyond the description alone |
| `facebookUrl` | `url` | Must be the event permalink, not `location/url` |
| `userName` | `location/name`, fallback `organizators/0/name` | Used as the establishment candidate for venue matching |
| `address` | `address`, fallback `location/streetAddress` / `location/city` | Used for unknown-venue review context |
| `timestamp` | `utcStartDate` | Event start time, not scrape time |
| `utcStartDate` | `utcStartDate` | Passed separately to the parser as reliable structured event timing |
| `mediaUrls` | `imageUrl` | Event cover image |
| `usersResponded` | `usersResponded` | Engagement context |

Important correction: `location/url` is usually the venue or page URL. It can help venue matching later, but it is not the event source URL. For the first integration pass, the normalized row keeps `facebookUrl` as the actual event URL from `url`.

Important OCR correction: the Facebook Events export has `imageCaption`, but that should not be treated as reliable OCR. The adapter does not map `imageCaption` into `ocrText`. After live testing, Facebook Events rows are now adapted as structured single-event records before the post OCR parser can fan out a cover image into unrelated event listings.

## Required Runtime Configuration

Set these before relying on automatic pickup:

- `APIFY_TOKEN`: Apify API token used by Functions.
- `FACEBOOK_EVENTS_SCRAPE_ACTOR_ID`: optional override. Defaults to `UZBnerCFBo5FgGouO`.
- `FACEBOOK_EVENTS_DEFAULT_SEARCH_QUERY`: optional override. Defaults to `Charlottetown PEI`.
- `APIFY_DRIVE_FOLDER_ID`: recommended. Use `1CiAw97ur95UVAWWLfmcY3ERbjxMrK7Ij` for the current `Apify Uploads` folder.

`APIFY_DRIVE_FOLDER_ID` is important because all Apify exports are currently named `APIFY Dataset.xlsx`. Folder scoping plus run-time filtering reduces the risk of the webhook selecting the wrong spreadsheet.

## Test Trigger

Endpoint: `startFacebookEventsScrape`

Example body:

```json
{
  "searchQueries": ["Charlottetown PEI"],
  "maxEvents": 4,
  "triggeredBy": "manual-codex-test"
}
```

The trigger intentionally caps `maxEvents` at `4` until the event flow is proven.

## Live Test Findings

Two tiny Charlottetown PEI actor runs were completed on `2026-05-18`.

| Run | Actor run id | Drive file id | Parser result | Cleanup |
| --- | --- | --- | --- | --- |
| 1 | `xBkdb1pcD5pgJRpAl` | `1gqXiTYiEw4oRvbwglgMOKclcVXceJm76` | Actor returned 5 rows even with a 4-event request; parser created 4 new standard events and updated 3 existing standard events before guardrails were added. | Created docs were backed up and deleted in `firebase/facebook-events-test-cleanup-backup-2026-05-18T15-50Z.json`. |
| 2 | `Msed45J13oWi4qbSD` | `1YCJruzddKt6TvzLj48Q0vSeP5VH11t9V` | Actor returned 4 rows but included one past event and was not sorted soonest-first; parser created 1 new standard event before the structured adapter was deployed. | Created doc and test unrecognized-venue residue were backed up and deleted in `firebase/facebook-events-test-cleanup-backup-2026-05-18T16-20Z.json`. |
| 3 | `F6UeWhh9BP6YXZJKp` | `11IS1hoeyaNqbUzpf-21fEijwL-2TrRQZ` | Structured adapter was active for all 4 rows; parser completed in about 10 seconds and created 2 standard events, with 2 rows queued for unknown venues. | Created docs and test unrecognized-venue residue were backed up and deleted in `firebase/facebook-events-test-cleanup-backup-2026-05-18T20-20Z.json`. |

The actor search response should not be trusted as already sorted or already future-only. The parser now sorts rows by `utcStartDate`, applies a local processing cap, and filters rows older than the configured grace window.

The third run proved the important parser behavior: Facebook Events rows no longer enter the post OCR/GPT extraction path. Logs showed `Using structured Facebook Events scraper row adapter` for each row and no `parsePostData` fan-out for the event cover images.

Remaining pre-schedule issues:

1. Add or confirm venue aliases for legitimate Charlottetown event locations such as `bar1911` and `Victoria Park, Charlottetown`.
2. Tighten category inference for structured event rows. The simple first pass marked `SIXX PAXX` as `Live Music`, which is not good enough for unattended scheduling.
3. Decide whether upcoming valid event docs from a test run should be kept or always cleaned up until the timer is enabled.

## Implementation Direction

The integration should stay inside the current scraper-then-parse pipeline, but with a dedicated dataset adapter:

1. `driveService.ts` detects Facebook Events headers, normalizes row fields, sorts by `utcStartDate`, caps tiny test runs, and filters past rows.
2. `rowProcessor.ts` maps Facebook Events rows into a single structured parser event before the post OCR pipeline runs.
3. The existing venue matching, unknown-venue review, duplicate detection, image storage, and Firestore write path remain shared with the posts pipeline.

This is the safer version of "integrate into the current parser": share the downstream pipeline, but do not treat structured event rows as if they were ordinary Facebook posts.
