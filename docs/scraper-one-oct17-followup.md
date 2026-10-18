# Scraper One follow-up — October 17, 2026

Coordinator: `codex/shared-offer-origin-20261014`, starting `6cddbda`.
This is an authorized paid acquisition experiment. Production remains on its
existing provider. No parser deployment, public GathR write, provider switch,
schedule change, model-generation call, or external message is part of this work.

## Completed source-bound recovery checks

The candidate remains `scraper_one/facebook-posts-scraper`, actor
`zanTWNqB3Poz44qdY`, immutable build `0.0.120`. Fresh account verification confirms
the existing paying Starter account; no new credential was created. Webhook
isolation was checked before each launch. The dedicated follow-up artifact folder
is `functions/artifacts/scraper-one-oct17-followup/`.

Exact-URL/profile regression run `dRkMcwVRJ8jQgQbIz` completed in about70 seconds,
returning six records for US$0.01525. The four exact failed post URLs reproduced
the same post IDs with no caption or attachments. Repeating these native lookups
does not recover the content. Their public post URLs returned HTTP400. The café's
exact photo routes returned a generic Facebook response without source-bound
image metadata. Those responses are held; no default image is substituted.

Two exact numeric author-profile lookups returned the expected IDs and names:

| ID | Verified display name |
|---|---|
|100064547837891|Prince Edward Island Government|
|100063644676590|Darcy's Trivia & Entertainment|

The library/government record1541103558051224 is a useful control discrepancy:
the official scraper labels its author as the library, while the candidate labels
it with the government ID but omits the name. Facebook's exact reel1423867724133537
has government OG attribution and first-party route props pairing that video ID
with pageID100064547837891. Together with the exact profile lookup, this supports
the candidate author ID. The requested publisher URL remains a separate fact;
no missing `sharedPost` relationship is invented. Hunter's author lookup resolves
to Darcy's, matching the returned PEITRIVIAPAGE content URL, rather than assigning
the requested Hunter's page as author.

All18 distinct video IDs in the prior104-record regression and78-record daily
sample yielded usable first-party preview images. Each requires an exact canonical
video/reel ID, an exact final Facebook resource URL, `og:type=video.other`, a
Facebook CDN image, successful image decoding, and recorded dimensions/hash.
Native captions, IDs, clocks, ordered attachment IDs, and explicit shared-original
objects remain intact. Recovery adds26 thumbnail fields and four missing author
names across the combined182 records. These are **enriched copies**, not native
actor output. Cached failures are not repeatedly retried.

The captured serving importer/validator accepts175/182 enriched records, compared
with169/182 native records across the two earlier samples. All supported source
fields survive the XLSX round trip; zero preservation failures, zero remaining
video attachments without preview. The seven remaining content-empty records are
CityCinema1648299067307008, PEILibrary1626657405916538,
Trailside1558537279625937, Evermoore3655937754564689,
RobertMcMillan1668892618483893, CFCY1736055591862396 and
WaterfrontCafe1118397330940217. CFCY was already empty in the official control;
do not count it as a new candidate loss. The two event URLs are outside the
candidate's documented individual-post/reel/video input contract. Existing weekly
Facebook-event acquisition remains necessary; no successful exact event-cache
join has been demonstrated here.

Read-only checks of the three latest completed weekly event datasets examined
all24,9 and20 records respectively (October12,October5,September28). Neither
exact event ID was present. This was an existing-dataset read, not a new scrape;
the absence does not establish that the events are deleted or universally
unavailable. See `weekly-event-cache-check.json`.

Fresh function readback confirms ACTIVE `processdatasetresume-00465-tub`, latest
traffic and immutable source generation1792254013366124, matching the importer
captured at00:01:32 UTC. Archive SHA256:
`759cd3c110c562d0e3c9e383d23eb975925118b9a79484d5c826e9866ac78348`.
The importer VM blocks network/cloud clients. No candidate Stage1–5 decisions,
materialization, deduplication, venue binding, or publication have been exercised.

## Full comparison plan and operational safeguards

Frozen control: official run `i0cfrfOdZ96dcNpv9`, dataset `2r2EzoHF9PCOcHXHG`,
320 distinct requested URLs, lower UTC day2026-10-16, morning cutoff
2026-10-17T12:39:01.446Z. Candidate whole-day upper bound is October17; exclude
later records offline from matched coverage while retaining their actual charge.
Source-list SHA256:
`5d80524f9eb1ddd27196e1835c6619c6bcdd0a49ddb19b7be205f2bee4d5730a`.

Four sequential80-URL batches request10 posts/page, compared with at most three
per page in the saved official capture. Each cap reserves the entire requested
depth:80 ×10 ×US$0.0025 +US$0.00025 =US$2.00025. The follow-up total has a US$5
ceiling; previous actual charges plus the next full-depth reservation must fit.
Budget exhaustion cannot silently reduce the requested depth. Observed source
completion denominators are checked. Depth clipping, throttling, unknown launch
outcomes and unaccounted sources stop subsequent launches. Quiet pages require
explicit completion. Publisher-confirmed `PAGE_UNAVAILABLE`/`INVALID_URL` rows
remain explicit source holds, not successful content acquisition.

An intent is persisted before the paid POST; unknown outcomes are never retried.
One candidate actor runs at a time. Every paid launch checks webhook drift and
the actor's current active runs. An Apify `SUCCEEDED` run whose log says
`Rate limit reached` is an operational failure. The vendor's public README does
not give a numeric paid-account startup limit, so this test establishes observed
sequential behavior rather than claiming a documented quota or permanent fix.

Twenty-six offline guard checks passed, covering exact IDs, unrelated/generic OG
images, author conflicts, immutable raw records/attachment order, source roles,
green-but-throttled runs, empty runs lacking completion, quiet pages, terminal
source errors, and full-depth budget reservation.

Differing publisher/author URLs without an explicit shared-original object are
also flagged for attribution review. Exact verified profile aliases may resolve
URL spelling differences; unmatched aliases remain a review requirement. The
serving row contract does not retain all candidate author IDs/profile URLs,
`isReshare`, tagged locations, or original post IDs. The scratch workbook therefore
demonstrates supported importer compatibility only. A production adapter needs
explicit preservation and venue-binding gates for this richer provenance; passing
basic row validation alone is insufficient. Empty shared containers and declared
reshares without originals are held.

## Partial acquisition result — full comparison remains incomplete

First batch `3eLT5I0bmULbveYMu` is terminal:19m42s at256MB,42 post records,
US$0.10525. Its80 input URLs reconcile to76 explicit completions and four
`PAGE_UNAVAILABLE` diagnostics (Mussels & Bubbles, Decker's Dairy Bar, Gillis
Drive-In and Hungry Ghost). No source remains unaccounted; all observed depth
denominators were10 and no source reached that cap. The first launcher stopped
because it counted diagnostic sources as missing completions. The corrected
offline checker records these as explicit source holds. It also normalizes
Facebook's bare/www host aliases on the same exact path, with positive/negative
regressions. Neither adjustment conceals missing content or a different page.

Within the morning control window, this80-source subset retains23/23 exact
source/post keys, captions, author IDs and timestamps. All four shared originals
retain captions, author IDs, profile/post URLs, timestamps and ordered galleries.
Six additional within-window records and13 later records are separately recorded;
they are not claimed as new events. No duplicate source/post keys were observed.
This is an80-source result, **not** a completed320-source comparison.

Three matched posts initially have fewer image assets. One exact video preview
is recoverable. The other two are real poster losses despite the official
attachment typename `ProfilePicAttachmentMedia` and absent numeric media IDs:
Red Shores1640530994176767 contains a Jingle & Mingle poster; Baba's1678451547423705
contains the Rebekah Brown/Island Jazz October22 poster. Their downloaded control
images were decoded and visually inspected. Do not dismiss this attachment type
as a generic profile portrait. The Red Shores record has no candidate caption or
image, so exact post-ID recall alone hides a material content loss. Its saved
official parser output includes Jingle & Mingle; no new candidate parser outcome
is claimed. These control images were not inserted into candidate output.

The80-source batch contains five video IDs. Exact metadata hydration verifies two
(one already cached) and holds three whose source-bound preview metadata is
unavailable. This broader sample therefore disproves universal preview recovery:
the prior18/18 result remains valid only for that sample. Enriched importer
validation accepts40/42 records, with three video previews still unresolved.
One exact author-name equality check differs only because the serving importer
trims the trailing space in `Lamb & Frog: Yarn and Gifts `; raw acquisition and
evidence copies retain the original. This is recorded explicitly in the
normalization artifact, rather than silently counted as exact preservation.

## Resource and proxy correction prompted by Craig

I initially compared speed before controlling resource allocation. That was
premature. The official run used4096MB, whereas the candidate default and first
batch used256MB. Apify allocates CPU proportionally at one core per4096MB, so the
256MB test had1/16 of a core. See [resource rules](https://docs.apify.com/actors/running/usage-and-resources#cpu).

The immutable candidate build's `actorDefinition` declares min128MB/max512MB.
A requested4096MB probe was **clamped to512MB at launch**, confirmed in both the
launch response and terminal readback. The build's4096MB *build-container* setting
is not its allowed *run* memory. Apify permits publisher-defined PPE memory limits;
see [memory limits](https://docs.apify.com/actors/publishing/monetize/pay-per-event#set-memory-limits).
The launcher now rejects requests outside the published bounds and records actual
allocated memory so requested resources cannot be presented as effective ones.

| Same20-source input, window, depth20, build0.0.120 | Actual RAM | Seconds | Posts | USD |
|---|---:|---:|---:|---:|
|Earlier runC09eoSwklEKQiKxeI|256MB|350.689|78|0.19525|
|ProbeRELNfdjUvpOOVxD0x, requested4096MB|512MB|230.415|78|0.19525|

The second run is34.3% faster, with78/78 matching keys, captions and timestamps.
This is an observed256-to512MB comparison, not a successful4GB experiment or
proof that CPU alone explains latency. Captures are about40 minutes apart and
hidden proxy routing remains uncontrolled. Observed handling stays around three
source requests at once; there is no documented input concurrency knob.

No proxy override was sent in any test or in the saved official run input. The
candidate's four-field schema has no proxy configuration; its public README and
captured logs do not identify residential versus datacenter proxies or country.
Its source code is hidden. The accessible version metadata supplies no source
files. The official run has no explicit proxy override either, but its internal
default must not be assumed equal to the candidate's. The actual proxy type is
**unverified**, not proven residential, datacenter or direct. No unsupported proxy
parameter was invented and no proxy/account settings were changed.

Remaining240 full-source batch inputs were not launched. Qualification is held
because resource parity is unavailable, proxy routing is unverified, and broader
native source gaps remain. All three follow-up runs are terminal; actor charges
total **US$0.31575**, orUS$0.83525 including the earlierUS$0.51950 experiment.
No full-feed saving or monthly saving is established. The current US$29 account
minimum would also need to be included in any eventual monthly scenario.

## Current recommendation

Retain the current production provider. Author-name hydration and some video
previews have a small, demonstrated recovery path. Native image/link/event gaps
and the published resource ceiling remain provider constraints. A full comparison
has not passed. Do not treat this as a successful replacement rollout.

Concrete publisher questions/reproductions are now ready (not sent):

- Can max run memory be raised from512MB, and can concurrency be configured?
  Include the256/512MB comparison above; a4GB request is clamped.
- Which proxy class, country and session rotation are used? Can they be selected?
  There is no proxy input or identifying run-log evidence.
- Preserve image attachments represented as `ProfilePicAttachmentMedia`; the
  Red Shores/Baba's examples contain actual event posters.
- Recover the four reproducibly empty direct posts and expose supported event/link
  preview fields; the two exact event IDs are absent from the latest weekly caches.
- Hydrate missing author names by their exact IDs and distinguish publisher,
  content author and explicit shared original. Do not assign the requested page
  as author by default.
- Publish paid-account startup quotas and fail visibly on `Rate limit reached`;
  serial execution is a guard, not proof that the vendor rate-limit cause is fixed.

After those constraints are resolved or an explicit best-available-resource
comparison plan is adopted, finish the full-source acquisition comparison,
implement the provenance-preserving adapter, then test the current parser in a
separate publication-disabled shadow. The local helpers are not production code.
Final run/webhook/build checks are saved in `safety-verification.json`.

Primary references: [candidate README](https://apify.com/scraper_one/facebook-posts-scraper),
[input schema](https://apify.com/scraper_one/facebook-posts-scraper/input-schema),
[pricing](https://apify.com/scraper_one/facebook-posts-scraper/pricing).
