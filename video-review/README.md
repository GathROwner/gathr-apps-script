# Automatic listing videos

This independent Firebase codebase, `listing-video-review`, observes completed
parse datasets. It reuses existing scrape data; it does not change the main parser,
its automatic-resolution gates, venue assignments, event fields, images or app code.

## Daily flow

1. `discoverListingVideos` checks completed retained Drive datasets every ten
   minutes. Source/post/video/caption identities deduplicate repeated captures.
2. `reviewListingVideos` processes small batches every minute. Complete videos
   up to **90 seconds**, 50 MB input and 8 MB retained rendition are eligible.
   No per-parse/day clip quota or Terra escalation quota is applied.
3. Luna reviews sampled frames, source caption, current listing details/prices
   and a hash-bound speech transcript. Useful static and animated posters qualify.
   Generic business ads and past-only recaps are filtered. Empty speech/music is
   an audio note. Missing/corrupt evidence and concrete conflicts remain held.
   Terra independently reviews only eligible uncertainty, on identical evidence.
4. `publishListingVideos` runs every minute. Clear useful content with one exact,
   current source-linked listing is attached automatically, without a human click.
   It rechecks the assessment, source, listing fingerprint, human choices, full
   media hash/audio/format, activation flag, parser activity and registry lease
   before reserving and again before publishing. It never invents an event,
   fuzzy-matches a title, or overwrites another approved video.
5. The private site defaults to exceptions. **In GathR** shows published clips;
   **Filtered out**, **Waiting** and **All clips** retain the other outcomes.
   Refresh fetches current results without interrupting video playback or notes.

## Human decisions

**Use this video** queues attachment when a confirmed match exists. Multiple exact
source-linked listings can be selected on the page; the worker rechecks that chosen
context. Missing listings or contradictory facts still need resolution. No separate
message to the assistant is required for a confirmed match.

**Don’t use** prevents publication and removes this clip's owned published links
recoverably. **Not sure** holds a pending clip or pauses an owned published clip
until Use is selected. Historic pre-automation feedback is not retroactive removal
permission. An alternate candidate cannot remove another approved clip covering
the same listing. Human choices and notes remain separate from model assessments.

## Safety and retention

Public links and assets use the existing `listing_video_links`,
`listing_video_assets`, immutable SHA256 object paths and existing app endpoint.
No event or image is rewritten. A shared media-registry lease fences publication
and cleanup. Interrupted paid reviews do not automatically retry. Public upload
reservations can resume only with the same reviewed bytes and fresh guards.
Exact WAV hashes permit transcript reuse across posts and context reassessments.
Evidence paths include the reviewed context, preserving previous immutable runs.

Private clips/evidence expire after 14 days; decisions remain. Public assets stay
while referenced, then receive seven days of application grace before owned,
generation-checked deletion. Existing GCS soft deletion adds recovery retention.
`cleanupPublishedListingVideos` paginates without the legacy twenty-asset ceiling.
Its successful baseline protection check precedes pausing the legacy pilot cleanup
schedule. The legacy function remains deployed for recovery, but its capped job
must not run against a larger registry.

## Configuration and release

`runtime_metadata/video_review` controls `enabled`, `automaticPublication`,
`automaticPublicationEnabledAt`, `publishedCleanupEnabled` and the existing private
admin UID allowlist. Defaults are off. Publication activation is video-specific;
parser automatic-resolution gates remain unchanged. Set `automaticPublication`
false to stop new attachments while retaining review and cleanup.

Review/discovery keep the existing compute identity and authorized parser key.
Publication/cleanup use the already bucket-authorized Firebase Admin SDK identity,
with no model secret or new bucket permissions. The portal retains verified-email
and exact UID checks; private playback, notes and signed source URLs stay private.

Use the codebase-qualified dry run before release. Deploy only changed video
functions from this directory; never deploy the older main-parser checkout.
Current runtime evidence, typed snapshots and migration/activation receipts are at
`C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/automation-90s`.

Limitations: raw-capture-less virtual Apify datasets are held. Missing video URLs
are not automatically recovered through Facebook browsing. Source/occurrence
ambiguity is held. Models receive sampled frames and speech text, not a continuous
video/audio viewing. The reviewed Hokum trial demonstrated full 83-second handling.
