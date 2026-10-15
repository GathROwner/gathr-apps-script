# Remaining six audit groups: one exact repair batch

Status: **COMPLETE, approved and independently verified October 15 at 23:38:44 UTC.**
Craig approved this combined exact batch with “Okay do that” after reviewing
the content decisions and excluding online courses. Runtime prevention is live;
the guarded transaction and complete API/feed/media verification passed.
The source-reviewed plan below is retained as the pre-apply decision record.

## Short decision

- Ruby: preserve the eggroll card ID, recover three October15 specials at
  **$10/$6.50/$16**, and end two stale weekly meal records. The eggroll becomes
  the source-supported October15 one-off. Lunch clocks stay unknown.
- Mill River: restore Late Fall Stay & Play,from **October16**,from$149+HST
  per person/double occupancy, bounded by the currently announced **October27**
  golf closing. Exact clocks unknown; weather/availability caveat explicit.
- Blank Canvas: move the class to the verified store, preserving the event ID,
  October21 **18:30–20:30**,price/poster and creation timestamp. Mall stays context.
- Andersons Creek: recover October24 **13:00–16:00** End of Season Bash at the
  exact existing source-page venue; add the verified Course alias and resolve
  its queue. Existing free-food/drink cards remain unchanged.
- Other activities: restore Soft Internet Theory's **October3–January24**
  exhibition range; recover all three Christmas variety shows at verified
  times/$20 plus ticket fees; publish this week's Kensington selfie activity
  as one partial area event with three verified points and no route line.
- Online: remove the false RCMP office pin, preserve all three online sources
  in explicit internal holds/archive and clear their physical-venue queues.
  **This is not public online-event delivery.** That needs a separately supported
  app/API flow. PetSmart's national week stays held for local participation.

## Exact live targets

| Action | Exact path | Intended delta |
|---|---|---|
|Update|`venues/ZDUj9euh7NVJ6INSlHM8/events/L5a28Ds8uw1fruUanvna`|Existing eggroll: Oct15 one-off,$10,unknown clocks,current poster/source; preserve ID and stored uniqueId|
|Create|`venues/ZDUj9euh7NVJ6INSlHM8/events/oct15_cacciatore_20261015`|Oct15 Chicken Cacciatore,$10|
|Create|`venues/ZDUj9euh7NVJ6INSlHM8/events/oct15_chowder_20261015`|Oct15 Corn and Bacon Chowder,$6.50|
|Create|`venues/ZDUj9euh7NVJ6INSlHM8/events/oct15_burgers_20261015`|Oct15 two chicken burgers,side and small beverage,$16|
|Update|`venues/ZDUj9euh7NVJ6INSlHM8/events/UgLcsIkIDwEQY4X0J2Mm`|End unsupported weekly lifecycle; restore Hot Chicken Sandwich title from independently viewed original Sept17 board; preserve historical date/source/price|
|Update|`venues/ZDUj9euh7NVJ6INSlHM8/events/KbS30K8kGo985GRRnhyE`|End unsupported weekly lifecycle; retain historical fields; do not invent a current soup|
|Update|`venues/ZDUj9euh7NVJ6INSlHM8`|Exact old-occurrence replay retirement policy only|
|Create|`venues/fb_100064501492346/events/oct15_late_fall_stay_play_20261016`|Bounded date-only package,Oct16–27|
|Create/move|`venues/name_6387om/events/aKNMYQidduWybSfSLbus`|Same class ID/schedule/price/poster; correct venue/address/profile; preserve original createdAt|
|Delete moved path|`venues/name_2lgcnn/events/aKNMYQidduWybSfSLbus`|Only after atomic same-ID move to the store; global detail remains200|
|Create|`venues/jluPLYoWDPhhkJ4NZitP/events/oct15_end_of_season_bash_20261024`|Oct24,13:00–16:00 main bash|
|Update|`venues/jluPLYoWDPhhkJ4NZitP`|Append exact Course alias/normalized alias|
|Update|`unrecognized_venues/uv_0bc85bac3e8f10c27f2dcf52`|Resolve to existing Andersons Creek Golf Club; source sample retained|
|Update|`venues/slug_ccoagallery/events/XDJ0vlTopBBg3rEibyOj`|Preserve ID/media; actual exhibition date range with unknown overall clocks and printed visitor hours in description|
|Update|`venues/slug_ccoagallery`|Exact old one-day representation replay fence only|
|Create|`venues/GHVmi7KY2DhZIQQbVc0p/events/oct15_christmas_20261204`|Dec4,19:30–21:30,$20,exact ticket URL|
|Create|`venues/GHVmi7KY2DhZIQQbVc0p/events/oct15_christmas_20261205`|Dec5,19:30–21:30,$20,exact ticket URL|
|Create|`venues/GHVmi7KY2DhZIQQbVc0p/events/oct15_christmas_20261206`|Dec6,14:00–16:00,$20,exact ticket URL|
|Create|`events/oct15_kensington_skeleton_week`|Oct14–18,date-only,partial unordered area: library,Ruby’s,Island Stone; original organizer link/ordered gallery|
|Delete|`venues/slug_rcmpgrcpei/events/DyNagJgHATYYy8lzNjww`|Remove false physical office occurrence and generated copies; original online source retained below|
|Create internal|`online_event_reviews/oct15_1565755542263418`|RCMP two dated Teams sessions retained; no physical venue|
|Create internal|`online_event_reviews/oct15_1559060616262193`|Zoom webinar retained; public contract and printed AST clock clarification held|
|Create internal|`online_event_reviews/oct15_1569782475183274`|Past council livestream archived; no invented new occurrence|
|Update|`unrecognized_venues/uv_9519644513c31dd959b921c6`|Ignored physical-venue queue; retain sample and explicit online reason|
|Update|`unrecognized_venues/uv_57b80ec525a564ea5bf7adcd`|Same safe online handling|
|Update|`unrecognized_venues/uv_f88d85e66b103a049f33d35d`|Ignore expired online-only physical-venue review; preserve source|
|Create internal|`event_recovery_holds/oct15_petsmart_adoption_week`|NationalOct19–25 dates preserved; local partner/time confirmation remains held|
|Update marker|`runtime_metadata/event_feed`|266→267 and timestamp|

Twenty-eight document mutations:14 creates (10 public,4 internal),11 updates,
2 deletes (one is the same-ID venue move),1 feed marker. This adds nine new
public activity cards and preserves the moved card's global ID. No broad
duplicate cleanup,other venue edits or arbitrary historical backfill.

## Eight original image uploads

Only immutable,reviewed originals in the frozen media manifest may be uploaded
to `gathr-uploaded-images`. All eight local bytes are SHA256-pinned. Existing
objects are never overwritten; a retry may reuse only identical bytes.

- `postimages/reviewed-oct15-1512635307563171-651b25df83a17158.jpg`
- `postimages/reviewed-oct15-1512635307563171-4c579139cb3dfdd7.jpg`
- `postimages/reviewed-oct15-1512635307563171-a93b0029913952c4.jpg`
- `postimages/reviewed-oct15-1434266702222333-51da0fe2f0224093.jpg`
- `postimages/reviewed-oct15-1434266702222333-a515d68ef08d35c4.jpg`
- `postimages/reviewed-oct15-1434266702222333-8bb6b36c42b9cbc3.jpg`
- `postimages/reviewed-oct15-1750099763784887-98b271aae3a3b7cc.jpg`
- `postimages/reviewed-oct15-122317448546189551-2a5e8d3c3bdaad00.jpg`

No image or venue deletion is authorized. Existing class/gallery/bash images
are reused after200 checks. If image upload succeeds but the transaction aborts,
report the staged objects and retain them; never broaden cleanup.

## Sources and limits

Original twelve source snapshots,ordered galleries,72 initial related events,
13 venues and queue states are captured in `firebase/artifacts/six-groups-oct15/`.
Fifteen historical Ruby snapshots and independently viewed old board support
ending the unsupported Thursday recurrences; other Ruby daily/weekly parents
are not silently included. Corrected cents come from the actual October15 board.

First-party/primary-source evidence:

- [Mill River package](https://millriver.ca/package/late-fall-stay-play/): start,
  price,booking code and availability through closing. [Golf PEI's2026 table](https://golfpei.ca/course_dates/)
  explicitly lists Mill River closingOct27,subject to conditions. This is a
  current announced bound,not a guaranteed weather-independent last booking.
- [Soft Internet Theory](https://confederationcentre.com/exhibition/soft-internet-theory/):
  fresh HTML prints FromOct3,2026 untilJan24,2027,consistent with the Oct3
  opening and current source posts. A stale search snippet's Oct24 start is
  not used. Printed gallery hours remain descriptive; the exhibition interval
  does not claim continuous opening or ignore holiday changes.
- [Blank Canvas classes](https://www.blankcanvasartsupplies.ca/pages/workshops-classes):
  exact class/date/clock/$45 and classroom within the store. Browser source
  was readable; a separate direct fetch returned429. The actual original
  poster itself also prints store/mall/date/clock/price.
- [Kings Dec4](https://kingsplayhouse.com/event-detail-page/?slug=kings-christmas1),
  [Dec5](https://kingsplayhouse.com/event-detail-page/?slug=kings-christmas2),
  [Dec6](https://kingsplayhouse.com/event-detail-page/?slug=kings-christmas3):
  public community variety show,not merely a performer call. Exact Showpass
  API occurrences1535663/1535664/1535665 independently agree with Halifax
  clocks and$20 General tickets. The venue page's generic December “ADT” label
  is not trusted; exact UTC+Canada/Atlantic confirm correct AST-local clocks.
  Performer-registration forms are not public ticket links.
- Kensington: the original Chamber shared post and library’s own participation
  support the advertised current week. Oct14 observed availability through
  SundayOct18 uses the established local calendar-week interpretation. Only
  three existing,source-named,verified venue points are displayed; no six new
  guessed venues,route line or invented business hours.
- [PetSmart national week](https://petsmartcharities.ca/adopt-a-pet/adoption-events)
  confirms national dates; the local store's adoption service alone cannot
  establish local partner attendance or times. Keep this specific source held.

The current app/API lacks a supported public online-event flow. Sources are
preserved durably and prevented from acquiring office pins or geocoding Zoom.
The webinar poster's literal12:00AST before the DST transition needs host
clarification; noon Halifax is not silently assumed. No email/contact is sent.
These are named holds,not claims that every valid online source is now visible.

### Final content decisions after Craig's requested review

Re-read all four original captions and independently inspected each ordered
original image on October15. Decision: publish none of these four sources as
local physical listings from the evidence currently available.

| Source | Content decision | Publication decision |
|---|---|---|
|RCMP1565755542263418|Valid scheduled public recruiting presentations and live Q&A,Oct19/26 at20:00; caption explicitly says Microsoft Teams. This is more than the generic careers image alone.|Retain the extracted online sessions; no office map pin. Existing false physical parent remains an exact proposed deletion in this batch.|
|SportPEI1559060616262193|Valid free educational webinar with presentation/live Q&A,Oct20; poster explicitly says Zoom and12:00PM AST. Craig subsequently excluded online courses at this time; this educational webinar is excluded from the current recovery scope.|Skip publication and remove from recovery follow-up. Retain original source for audit only; no timezone clarification or online delivery work is required for this source.|
|Stratford1569782475183274|A real council-meeting livestream explicitly datedOct14,16:30; already past at theOct15 audit.|Archive/skip new publication; no invented future meeting or YouTube venue.|
|PetSmart1561342776030307|A real national adoption campaign Oct19–25. Original national post/poster and refreshed national/store pages do not establish a specific local partner session.|Skip local publication from this source; retain the reviewed national source/decision. Lack of local participation evidence is the blocker, not missing clock times alone.|

The first two are genuine online activities. Craig's latest policy excludes
online courses and the SportPEI educational webinar from current recovery.
This does not establish a blanket exclusion of every online event type; RCMP
recruiting information sessions retain their separate representation decision.
Preserve in-person classes and physical calendar items when a source also
mentions an online course. The internal source-retention entry in the proposed
batch does not authorize further recovery work on the excluded webinar.
The current exact live/media plan is unchanged by these review decisions;
approval/apply and post-write verification remain separate.

## Implementation and gates

Isolated release branch `codex/six-audit-groups-20261015` starts at serving
6c5c46f. Source-only changes add exact owner-backed GolfClub/Course resolution,
verified store-classroom precedence while retaining mall context, conservative
price-amount protection and explicit online/platform detection even when the
model's spatial metadata is missing. Wrong-page,off-site,relocation,multi-site,
hybrid,physical-registration and compatible price-detail controls are tested.
No new model requests,prompt/model/effort/allocation/cache changes or global
date-only/festival publication switch. No resolver-baseline deployment.

Final build/focused/full tests,actual saved Stage3 and formatted-class playback,
all online saved-source holds,exact retirement identities,seven existing
API capability contracts,partial-area validation and exact Showpass UTC/local
agreement are required before final grouped approval. No paid calls in playback.
Committed runtime candidate: `ac0e59b360f04fc01ff7ed251f54d30421e3c66b`,
descending from exact serving baseline `6c5c46f` through `b67cb37` and `a237b78`.
The final occurrence-scoping control prevents an unrelated webinar elsewhere
in a multi-activity source from holding its physical class.

Final candidate evidence:

- TypeScript build passed: `functions/artifacts/six-groups-build.txt`.
- All 23 focused tests and all 843 compiled backend tests passed, zero failures:
  `six-groups-focused.txt` and `six-groups-full-tests.txt` in that directory.
- Actual saved-source offline playback passed at 23:20:24 UTC: both venue
  sources and saved formatted class, three online source holds, seven existing
  API capability contracts, decimal price protection, eight exact retired
  identities, three Showpass UTC/local occurrences and partial-area contract.
  Evidence: `firebase/artifacts/six-groups-oct15/offline-playback.json`.
  Zero network/model calls and zero live writes in this playback.
- All eight helper files passed `node --check`.
- Qualified three-parser Firebase dry-run evidence:
  `functions/artifacts/six-groups-deploy-dry-run.txt`; final candidate completed
  successfully at 23:21:32 UTC with `Dry run complete!`, exit zero. Exact target:
  `functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows`,
  project `gathr-migrated`. The existing firebase-functions package warning
  remains; no SDK/dependency upgrade is included in this repair.

Saved fresh serving-before readback still matches accepted Harvest hash
`8a3e2aaeaf3c7d56648fc5ce15b5c709a6fbadaa` on all three parsers. No new
production deployment or live record repair is implied by local test success.

Default-dry helper: `firebase/repair-six-groups-oct15.mjs`.
Frozen current plan: `firebase/artifacts/six-groups-oct15/plan-2026-10-15T23-12-55-041Z.json`.
Full backup: matching `backup-2026-10-15T23-12-55-041Z.json`.
Dry run:28 mutations,8 proposed original uploads,132 guarded references,
108 related existing events,**zero live writes**. Fresh source,exact show,
price,venue,target,sibling,marker and image-byte drift aborts rather than
broadening the batch. A fresh complete prewrite backup and idle parser lock
are mandatory. Apply requires the exact approved plan and independently
ACTIVE/100% common new parser hash with unchanged full configuration.

After approval: narrow three-parser release/readback; eight pinned uploads;
one atomic Firestore transaction; independent exact-delta/details/default and
capable complete feeds/recurrence-absence/media verification. The seven marked
date-only activities remain hidden from incapable older clients; Preview uses
the already approved capability contract. Production client delivery/global
automatic date-only publication remain separate. No OTA or map interaction.

## Applied release and independent verification

Craig approved the exact grouped plan, including the two deletes (one a
same-ID venue move), eight original uploads and the 28-document atomic
transaction. Online courses/educational webinars remain excluded from recovery;
the retained internal source entry is audit evidence. PetSmart's unconfirmed
local attendance was not published.

Fresh preflight at 23:34:39 UTC reproduced the approved snapshot hash exactly:
`ba2226c1f186d9c5c78334f93c9c76814097a24f03ace1aaaa27df3750edf928`.
The parser was idle before release and at the atomic repair. No source, target,
venue, sibling, feed marker or source-image drift was bypassed.

Runtime candidate `ac0e59b360f04fc01ff7ed251f54d30421e3c66b` was deployed from
`codex/six-audit-groups-20261015` in the isolated `arts-mixer-release` checkout,
using the exact narrow command:

```powershell
firebase deploy --only 'functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows' --project gathr-migrated --non-interactive
```

All three parsers independently read ACTIVE, 100% latest traffic at common
source hash `8073c2d8a8520e8362a71df53c76b718751fabfb`:

| Function | Serving revision |
|---|---|
| processDataset | processdataset-00491-yon |
| processDatasetResume | processdatasetresume-00455-nen |
| processDatasetSelectedRows | processdatasetselectedrows-00447-yan |

All complete function/runtime/environment/secret-binding fingerprints match
the previous serving baseline. Stage models, efforts, allocations, prompts and
caches remain preserved; global automatic date-only/festival publication stays
off. The separate coordinator festival-shadow additions were not deployed.
Accepted runtime patches were integrated into the coordinator as
`e109584`, `915e911` and `a330f34` for baseline continuity. The existing SDK
warning is unchanged; no SDK or dependency upgrade was attempted.

The exact transaction applied at 23:38:14 UTC. Artifacts under
`firebase/artifacts/six-groups-oct15/`:

- `prewrite-2026-10-15T23-38-00-778Z.json`: complete fresh prewrite backup.
- `applied-2026-10-15T23-38-00-778Z.json`: exact 28-document result/eight assets.
- `serving-before.json` and `serving-after.json`: independent release readback.
- `independent-verification.json`: all checks passed at 23:38:44 UTC.
- Deploy transcript: `functions/artifacts/six-groups-deploy.txt`.

Independent verification confirmed the exact delta and 104 untouched references;
14 public event details; RCMP false-office detail 404 and no generated copies;
Blank Canvas same global ID 200 at the correct store with original path absent;
two old Ruby weekly parents no longer materialize active occurrences; seven
marked date-only contracts omitted from incapable default clients; all eight
original assets hash-identical and all retained image/profile URLs 200; marker 267.
Complete capable active feed 973 events/10 pages, history 1135/12 pages and
default active feed 965/10 pages were checked without map interaction or an OTA.

This completes the six reviewed audit groups' approved prevention and repair
batch. Current online/PetSmart publication decisions are settled skips/holds.
The original policy/source-unavailable holds, three older Inn source reviews
and broader backend backlog remain separately recorded in
`docs/oct15-repair-scope-and-status.md`.
