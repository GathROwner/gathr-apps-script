# Independent review: Dami Facebook scraper replacement

Reviewed October 17, 2026, from the accepted GathR coordinator branch
`codex/shared-offer-origin-20261014`, starting HEAD `9e20eb9`.
Originating audit task: **Audit GathR Apify spend and optimization…**,
`01a145c6-7181-7b22-94f3-8c739506a0c0`.

## Decision

The audit is useful and its recommendation for an adapter plus fallback is sound.
Dami is worth a controlled implementation/shadow trial. **Do not switch production
by changing the actor ID alone, or make Dami the sole source yet.** It replaces the
daily public Facebook-post scraper, not the AI parser, Facebook Events actor or
Facebook Search actor. No production migration is authorized by this review.

The main risk is silently incomplete successful retrieval, not column naming.
Losing an occasional uncertain activity is acceptable under Craig's policy; the
confirmed shared-post omissions are systematic and could remove multiple events
or original-business provenance from a single post.

## Evidence independently checked

Read the audit task's final handoff, raw nine-run manifest/items, 96-row comparison,
baseline snapshots, converted/imported rows, direct-parser input tasks and image
follow-up. Recomputed 67/96 initial matches, 95/96 after retries, 121 distinct
Dami posts, nine shared originals flattened to unmarked/media-empty status posts,
and US$0.09222 actual pilot actor charges. The original report's 174 returned media
references were resolved locally; that is not proof all original media was returned.

The actor's public API currently identifies `EXNh69YkiB1C2C1Fo`, latest build
`2.0.56` (same build as the pilot), with US$0.0015/start and US$0.00064/post on its
Starter tier. Publisher documentation still explicitly limits retrieval to the
newest 20 posts before date filtering and warns pinned posts can be missing.
[Actor documentation](https://apify.com/dami_studio/facebook-posts-scraper),
[published pricing](https://apify.com/dami_studio/facebook-posts-scraper/pricing).

Fresh live readback confirms the current parser Resume function is ACTIVE at
`processdatasetresume-00465-tub`, source hash
`0c06b198eacb9cf32171e0d68fbea89e889a93c3`. The pilot used `00457-vaz`; its event
counts and schema failure are not current-parser acceptance. Current accepted
source was inspected for importer, shared-origin and engagement contracts.

## Material issues

### 1. Shared originals are a release blocker without dependable recovery

All nine known shares lost their original caption and images, appearing as ordinary
status posts without a share marker. Evermoore lost three extracted activities;
Kool Breeze and Robert McMillan Pottery lost their advertised activities entirely.
Current GathR code also uses original author/name/profile/post/time to prevent
sharing-page venue attribution errors. Missing that information can undermine
the Daisy/PEI Foodies safeguards even if a caption still produces an event.

Fallback for all status/media-empty posts covers the nine shares and three missing
preview-image cases in this sample. It is not a proven universal detector for
shares. Keep sources requiring original-author fidelity on the existing provider
until independently verified. Do not synthesize original fields or silently merge
one provider's caption with another provider's gallery.

### 2. Retry-on-error alone is insufficient

The two initial 25-page runs both succeeded, but matched only 67/96 baseline IDs.
More seriously, Confederation Centre returned `NO_RESULTS` despite two baseline
posts, both subsequently recovered by smaller retries. Be You returned two posts
with no diagnostic while omitting another baseline post. That missing Be You post
had zero baseline events, so it is a coverage warning rather than confirmed event loss.

The pilot retry script selected missing pages by comparing with the existing
provider's baseline. Dami alone does not supply that completeness oracle. A
production design needs a per-requested-page coverage manifest, suspicious-empty
checks based on known activity, retained fallback, and periodic independent
coverage comparison. Do not permanently mark active sources quiet from one empty
result. Small batches mitigate failures but don't establish complete retrieval.

### 3. Hard depth and pinned-post limits

The newest-20 ceiling applies before date filtering. A larger lookback cannot
recover an older event post displaced by 20 newer posts, nor guarantee catch-up
after an outage. Pinned omissions are an explicit additional publisher limitation
and were not specifically validated by the pilot (no pinned controls were found).
Busy/pinned-dependent pages and catch-up work need the existing provider. Pin the
tested actor build during evaluation and separately assess future build changes.

### 4. The spreadsheet adapter drops engagement fields

The prototype converted rows omit likes, shares, comments, top reaction count and
profile-picture headings. Imported post `1565816972252501` has null engagement
fields although its raw Dami record has nine reactions and five shares. Its direct
parser harness separately injects those values. Thus content-import compatibility
and direct parser results do not prove the full production mapping is intact.

Preserve documented metrics and distinguish total reactions from Like reactions;
do not write total reactions into likes without defining compatible semantics.
Preserve zero versus unavailable counts. Check downstream engagement display and
ranking with the real importer. Map the available page profile picture where
appropriate. This is a prototype integration gap, not a reason to reject Dami.

### 5. Image recovery needs the real cloud path

The exact-media-ID HTML resolver and decoding evidence are a good proof of local
feasibility. The unchanged importer/downloader cannot directly consume the native
`thumbnailUrl` headings and HTML lookaside responses. The resolver introduces
additional Facebook requests, expiration, throttling and markup-maintenance risk.
Bound requests, bytes, concurrency and redirects; preserve full gallery order;
do not accept partial media as complete. Validate the actual managed upload and
event-to-image assignment without borrowing cached current-provider images.
Accessibility alt text must not be represented as trustworthy flyer OCR.

### 6. Delivery, edits and rollback still need integration proof

Multiple three-page actor runs require one coordinated logical scrape window and
coverage accounting, not independent half-complete batches that publish twice.
Verify webhook/Drive timing, diagnostics/sample filtering, pagination and the
existing direct-dataset fallback cap (default10/max100 in inspected source).
Do not assume webhook success means the entire logical daily scrape completed.
Keep one selected provider record per source/post. Preserve meaningful edits,
post IDs as strings, idempotence and all current duplicate/recurrence/festival
guards. A provider configuration rollback must fence in-flight work; it does
not undo already published data.

The live Apps Script caller source was not obtained by the original audit due
to OAuth failure. Establish that actual caller before implementation; don't assume
the local legacy Apps Script files are the current scheduled source. The existing
weekly Events and Search actors have separate jobs and must remain separate.

## Economics: promising, not an established monthly bill

The reported 81.6% pilot acquisition reduction is arithmetically consistent:
US$0.09222 versus US$0.500 attributable existing-provider rows. Coverage differed,
and this excludes complete fallback/image/AI/publication costs. The base US$5.80–7.74
scenario includes small-batch starts but excludes fallback/retries and is not a
measured full-month bill. The audited account's US$29 prepaid subscription minimum
also limits cash savings; do not confuse it with the generic current public plan
advertisement. Eligibility for another plan was not checked and no plan changed.

The 167-versus-174 extracted-event counts are not accuracy or event recall. The
sample was deliberately difficult, capture times differed, original-input controls
varied, and final Firestore deduplication/materialization/app image display weren't
exercised. Dami-only output is not automatically new coverage.

## Recommended next boundary

Build a separate provider adapter/orchestrator against the current accepted
baseline; preserve the existing provider as default. Keep shared-origin-sensitive,
busy, pinned-dependent and incomplete pages on existing-provider fallback. Run
three to seven complete daily shadow cycles, including cold and warm media paths,
with an explicit spend cap and no production event writes. Evaluate complete
source/event/image fidelity, meaningful edits, full logical-run completion and
actual combined cost. Then review a narrow cohort activation and rollback.

This review starts no actors, invokes no AI/parser endpoint, changes no production
code/configuration/data/schedule/subscription, and sends no message to the audit
task. It records an independent assessment, not implementation or rollout success.

## Evidence locations

- Original handoff:
  `C:/Users/craig/Documents/Codex/2026-10-16/gathr-apify-usage-audit-20261016/outputs/dami-implementation-handoff-2026-10-16.txt`.
- Original pilot inputs/results:
  `C:/Users/craig/Documents/Codex/2026-10-16/gathr-apify-usage-audit-20261016/work/pilot/`.
- Independent arithmetic, coverage counterexamples and engagement mismatch:
  `functions/artifacts/dami-oct17-independent-review/raw-evidence-check.json`.
