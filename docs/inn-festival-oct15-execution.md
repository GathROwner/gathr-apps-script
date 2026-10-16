# Approved Inn repair and festival activation — October 15

Craig approved the combined exact batch with “I approve.” Execution continued
from the committed, independently tested isolated releases. No new approval
was requested. Original plan: `docs/inn-and-festival-oct15-approval-plan.md`.

## Inn correction — complete

Fresh01:55UTC dry runs matched both approved fingerprints/payloads exactly,
with no active parser. The qualified three-parser deployment from372be0c
completed. Independent ACTIVE/100% latest-traffic readback shows common hash
`4382eb69612394a7dac62c6dcc80465cb562f2c0`:

| Function | Revision |
|---|---|
| processDataset | processdataset-00492-fen |
| processDatasetResume | processdatasetresume-00456-vub |
| processDatasetSelectedRows | processdatasetselectedrows-00448-yic |

Full function/runtime/environment/secret-binding fingerprints match the
pre-release baseline. All stage models, prompts, efforts, allocations, cache
and global date-only settings remain preserved. The release passed851 compiled
tests and its qualified dry run. Actual transcript:
`arts-mixer-release/gathr-apps-script/functions/artifacts/inn-release-deploy.txt`.

The exact transaction applied01:59UTC with full fresh prewrite backup. Two
genuine16:00 tours retain their historical records/weekly schedules and now
end at the October10 season boundary, without invented finishes. Only the
wrong October16 15:00–21:00 guest foraging card was deleted, with its original
data/source retained in the approved private hold. No media writes.

Artifacts under `firebase/artifacts/inn-legacy-oct15/`:

- `prewrite-2026-10-16T01-59-00-041Z.json`
- `applied-2026-10-16T01-59-00-041Z.json`
- `serving-before.json`, `serving-after.json`
- `independent-verification.json`

Independent02:00:17UTC verification passed exact changed fields,14 unchanged
references (all12 Harvest evenings plus2 sources), both historical tour
details200, wrong foraging404, no active parent/materialized copies, all20
retained media200, and marker268. Complete feeds: default888/9pages,
capable896/9pages, history1134/12pages with one copy of each historical tour.

## Festival bootstrap and real shadow gate — complete

The approved seven internal records applied02:00:36UTC with full fresh
prewrite backup, zero public writes and zero paid calls:
`functions/artifacts/festival-linker-oct15/seed-applied-2026-10-16T02-00-36-190Z.json`.
The preservation snapshot pins29 documents, all17 human links, their children,
venues, umbrella/review, exhibition and feed marker.

A telemetry-only correction ensures a reviewed nonmember without a complete
cached capture still explicitly reports that limitation. It changes no
membership/publication rule or approved record payload. Coordinatord8c7e32,
isolated worker8cbf065; build and21 evidence/worker controls passed. Earlier
full isolated suite922/922 and qualified worker-only dry run passed.

The separate function deployed in shadow mode, ACTIVE/100% latest at
`scheduledfestivallinker-00001-xem`, hash
`6274ba2f70e907491c57b2fe302fbd0c931e2b47`. Its five-minute Cloud Scheduler
job is enabled, America/Halifax. This is a quiet backend worker, not a Codex
heartbeat or user messaging schedule. Existing SDK-version warning was retained;
no deferred SDK/dependency upgrade was performed.

The actual Cloud Scheduler invocation completed and was independently verified
02:05:24UTC: all29 protected document versions unchanged;17 manual links and
all17 child details intact;7 bootstrap documents exact;4 eligible already
linked children;5 conservative holds;1 reviewed nonmember still explicitly
reporting incomplete capture;0 unreviewed source gaps;0 public additions;
0 paid calls; marker268. Complete default888 and capable896 feeds,9pages
each, preserve exactly one umbrella and no duplicate linked children. Private
evidence stays absent from public metadata; all four private collection probes
reject anonymous reads. Artifacts:

- `functions/artifacts/festival-linker-oct15/serving-shadow.json`
- `functions/artifacts/festival-linker-oct15/activation-preservation-before.json`
- `functions/artifacts/festival-linker-oct15/activation-shadow-verified.json`

## Publication activation

The real shadow gate passed. The approved worker-only publish dry run and
deployment completed. Independent02:10:27UTC readback verifies:

- ACTIVE,100% latest, `scheduledfestivallinker-00002-toj`
- source hash `fb36e3d398f53d32f68a2fcef1c093819edd28f0`
- `FESTIVAL_LINKER_MODE=publish`
- Same complete function/runtime/secret-binding fingerprints after excluding
  only the approved mode value, revision and container image.
- Enabled every5minute America/Halifax scheduler, HTTP deadline540seconds;
  function timeout540seconds, maximum1instance, fenced lease600seconds.
- All three parsers remain ACTIVE/100% at4382eb69612394a7dac62c6dcc80465cb562f2c0
  with their unchanged full configuration fingerprints.

An actual publication-mode Scheduler invocation completed and was independently
verified02:12:10UTC. It preserved all29 protected document versions and17 manual
links, verified all7 bootstrap records and17 public child details, retained4
eligible existing links/5 holds/1 reviewed nonmember with incomplete capture
explicit, and made0 public additions/paid calls. No additions were needed.
Private ownership correctly adopted0 human links; no manual removals were
invented. Complete default888/9pages and capable896/9pages feeds preserved one
umbrella and no duplicate linked children, marker268. Four private collection
probes returned403. Actual source/claim/publication paths were exercised;
synthetic new-addition tests remain separate from this zero-delta live pass.

Final artifacts under `functions/artifacts/festival-linker-oct15/`:

- `serving-publish.json`
- `activation-publish-verified.json`

Both worker deployment transcripts and qualified dry runs are in
`festival-publication-release/gathr-apps-script/functions/artifacts/`.
Final worker runtime commit8cbf065 is assembly48a6982 plus the telemetry-only
source-limitation correction. Its build/21 focused controls passed; the earlier
922 full compiled tests cover the same eligibility/publication behavior.

**Rollout decision: enabled for source-verified additions to reviewed editions.**
Uncertain sources, unavailable galleries, shared image-only heading cases,
missing ownership/venues/clocks and official conflicts remain explicit holds.
No children/venues/times are invented, no automatic removals or broad dedup
cleanup occur, and no Codex heartbeat, map interaction or mobile OTA was used.
This closes the approved Inn/festival batch; it does not claim every future
festival source shape or unrelated backend backlog has been completed.
