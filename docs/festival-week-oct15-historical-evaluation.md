# Historical festival source evaluation — October 15, 2026

Scope: local dry runs and Firestore reads only. No live event/review/venue/media,
queue, parser, configuration, publication ownership or capture-cache writes.
No deployment. Existing service-account path and existing API secret reused.

## Saved source inventory

`functions/artifacts/festival-week-oct15/inventory.json` records nine completed
datasets from October 8–15, including the separate October 12 Facebook-event
dataset. Each passed the lock/processed marker/final batch/no-checkpoint gate.
There were 1,118 saved regular-source records after per-run latest-source and
original-run-window filtering. These are saved snapshots, not all scraped rows
or a claim that every rejected post retained a snapshot. Keyword/title screening
found 47 source appearances representing 39 distinct source IDs. Image-only
festival mentions without a recognized saved title are outside this first scan.

Fresh production registry discovery still returns only ANCHOR Fest. The current
worker links existing canonical children to already reviewed area editions;
it does not create new festival overviews, children or venue points.

## Actual production worker playback

`production-worker-replays.json` records the existing worker run in
`mode=publish,dryRun=true` against all nine completed datasets, using current
canonical records and existing caches. Four completed with zero additions;
five stopped at their first uncaptured source. Those are incomplete historical
coverage, not successful zero-link inventories. All nine made zero model calls
and zero remote writes. Old-run playback does not claim historical database
state or new live parsing latency.

## Useful new cases

| Source | Saved evidence | Current outcome |
|---|---|---|
| Founders' Harvest Fest, Oct 17 | Overview plus separate Oct 15 band post | Existing 15:00–20:00 venue event and two live music children; not registered as an area edition |
| Summerside Pumpkin Festival, Oct 15–31 | French/English two-image programme, source 1539985468169427 | 13 reviewed activity records currently exist; no registered festival overview |
| Jack Frost Winterfest, Feb 26–28, 2027 | Source 1633318801534876, caption names Delta/Frosty Funland | All five saved original images return 403; cannot claim complete gallery replay |
| Charlottetown Christmas Festival / Victorian Christmas Market | Explicit festival-membership caption in source 1107550422211144 | Existing city-scoped records are outside the reviewed-area registry; festival crosses year boundary, also unsupported by current registry |
| Charlottetown Scarecrow Festival, Oct 1–31 | Source 1613024737535693 | Broad discovery caption, no timed individual programme in this source; its older Oct 3 reviewed root has been expired by cleanup |

Indulge Food & Wine Festival is explicitly in St. Andrews, New Brunswick in its
saved caption. It is not a PEI festival candidate. Past Oktoberfest/Fringe
mentions and historical festival biographies are not upcoming edition proof.

### Harvest caption-context test

Both original band images returned 200 and were inspected. New local evidence
extraction and independent model verification correctly recognized Salty Sailors
15:00–17:00 and Vintage 4.0 18:00–20:00. The deterministic validator rejected
both as `cross_card_excerpt`: the shared date/venue appear in the preceding
caption paragraph instead of each individual band row. The existing caption
scope expander accepts standalone date headings, not this prose structure.
The year/organizer are not printed and remain empty. The short `Founders'`
venue wording is also not an exact current venue alias. Thus complete source
capture is not equivalent to publication readiness; zero eligible links passed.
This is a real, source-supported test case for narrow inherited-context support,
with edition identity/venue identity still independently verified.

### Pumpkin source resolution test

The exact saved 590-pixel gallery returned 200 and both images were inspected.
The first model call explicitly returned `complete=false`, reporting unreadable
small programme text. This response remains held and was not sent through the
matcher as a complete capture.

Removing only the Facebook `ctp` thumbnail parameter recovered larger images
of the same two asset IDs. Both variants returned 200 and were independently
inspected; they show the printed 2026 edition and legible bilingual programme.
These are separately labeled source-asset variants, not the exact saved URLs,
and do not replace production provenance or caches. Separate trial artifacts:
`local_pumpkin_2026/asset-variants.json` and `pumpkin-large-trial/`.

The larger-source trial completed two real model calls: extraction marked the
source complete and returned 42 bilingual rows, and independent model review
accepted 39. These are French/English rows, not 42 distinct events. Deterministic
row-scope validation still held 40 as `cross_card_excerpt`, predominantly because
image date headings sit above individual activities. Only two corn-maze rows
passed that validator; both then held as `evidence_missing` in the unchanged
pure matcher. No link passed. Shared image programme/date heading binding and
bilingual edition identity remain unfinished; higher resolution alone is not
enough. No authority or venue was fabricated to make the test pass.

`matcher-results.json` records these results plus identical outcomes when source
and candidate order are reversed. Total new paid work in this evaluation was
five calls (three sources/variants), 24,398 input tokens, 26,697 output tokens,
and 242,748 ms summed API latency. This is source-evidence testing, not a
five-stage parse benchmark; historical worker dry runs and offline matcher
playback add no paid calls or API timing evidence.

## Recommended sequence

1. Use Summerside Pumpkin Festival as the next reviewed overview candidate.
   Reconcile its programme against the existing 13 children and hold uncertain
   venues, routes, private school activities and untimed entries. Do not create
   a second copy of any child. Exact live overview/link approval remains required.
2. Improve source capture to request a verified larger variant when a dense
   original is only a thumbnail, keeping ordered gallery identity and an honest
   unavailable-source hold. Do not treat a different gallery/photo as equivalent.
3. Extend literal caption and image scope to unambiguous shared date/venue headings,
   with boundaries at new headings/venues and negative tests for mixed dates,
   competing festivals and cross-card clocks. Preserve edition/ownership gates.
   Bind bilingual headings to a separately reviewed edition and collapse proven
   translations to one canonical occurrence rather than duplicate activities.
4. Decide separately how single-venue festivals should expose schedules in the
   existing app, and how reviewed city/cross-year editions enter the registry.
   Do not misclassify Founders as multi-location just to fit the area-only gate.

All proposed editions in local trials are explicitly unreviewed and cannot
publish. This evaluation changes no Stage 1–5 behavior or release configuration.
