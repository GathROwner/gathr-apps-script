# Daily private video review

Independent Firebase codebase `listing-video-review`. This observes the existing
`processed_datasets` completion records; it does not redeploy or modify any parser,
public listing, public video asset, automatic-resolution gate or app bundle.

## Operation

* `discoverListingVideos`: every ten minutes, reads completed Drive datasets from
  the last 48 hours after the explicitly configured activation timestamp. Flattens
  both ordinary and shared-post video fields, retaining the outer post identity.
  Uses deterministic source/video/caption/policy IDs across repeated datasets.
* `reviewListingVideos`: every minute, one globally fenced worker, up to five
  clips per invocation. Full clips only: 60 seconds / 50 MB original / 8 MB private
  rendition. No trimming, invented context, title-only source matching or public
  writes. Known missing context/audio skips paid calls and stays watchable.
* Existing v2 worker samples frames and transcribes speech once, calls Luna first,
  then at most one blind Terra review for eligible uncertainty. Animated promotions
  qualify. Missing evidence is held; Terra cannot manufacture it.
* No per-parse or daily clip-count caps, and no Terra escalation quota. Small
  batches pace work without discarding overflow. UTC request counts track cost.
  Immutable evidence is uploaded once; unchanged files are not rewritten between
  phases. Call intents are uploaded before a paid request. An interrupted attempt becomes
  held and is never automatically retried. The same captured candidate is not paid
  for again on the next day's dataset. Exact transcript reuse across different
  posts is not implemented in this initial service.
* `cleanupVideoReviews`: daily, generation-checked deletion of owned private clips
  after 14 days. A bucket lifecycle also expires evidence after 14 days. GCS soft
  deletion retains recoverable objects another seven days; this affects billing.
  Decisions and append-only human judgments remain private Firestore metadata.
* The private portal uses existing GathR email/password authentication, verified
  email plus an explicit UID allowlist. No new login account is created. The shell
  is public; queue, playback, notes and source transport URLs require authorization.
  Source CDN URLs and API keys are never returned to browsers. Expired/missing or
  over-limit clips provide an original-post link instead of pretending to play.
* Human actions are `want_video`, `agree_with_decision`, or `unsure`. Each binds the
  exact saved assessment revision and clip hash. They do not publish videos or
  overwrite automated decisions.

## Configuration and release

Private `runtime_metadata/video_review` document:
`{enabled: boolean, enabledAt: ISO timestamp, adminUids: [approved UID]}`.
Default is OFF when absent. The bucket must be `gathr-private-video-reviews`, with
uniform access and enforced public-access prevention. Keep existing bucket IAM
and public listing media unchanged. Worker uses the parser's existing compute
identity and `GATHR_OPENAI_API_KEY` secret; API key reuse was authorized by Craig.

Release only the four functions in this codebase, with `--dry-run` first. Never
run the main parser codebase deploy from this older diagnostic checkout.

```powershell
npm ci
npm run check
npm test
firebase deploy --config firebase.json --project gathr-migrated --only "functions:listing-video-review:discoverListingVideos,functions:listing-video-review:reviewListingVideos,functions:listing-video-review:cleanupVideoReviews,functions:listing-video-review:videoReviewPortal" --dry-run
```

Before enabling, verify bucket privacy, UID identity, existing secret binding,
normal-account deploy access, live completion capture, rendered phone/desktop UI,
unauthorized queue/media denial, one real processing receipt and unchanged parser
revisions. Disable via `enabled:false` without disabling cleanup or portal review.

Limitations: virtual `apify-dataset:` files without a retained raw capture are held
in the dataset ledger. No yt-dlp, fresh scraper runs or public-source crawling is
invoked automatically. Initial exact binding uses retained `sourceUniqueIds`; a
missing legacy scalar-only source remains held. Multiple active listing matches
need human selection. Models see sampled images and speech text, not full audio.

Official references: [Firebase codebases](https://firebase.google.com/docs/functions/organize-functions),
[scheduled functions](https://firebase.google.com/docs/functions/schedule-functions),
[OpenAI transcription](https://developers.openai.com/api/docs/guides/speech-to-text).
