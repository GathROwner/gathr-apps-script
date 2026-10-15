# Rodd Brudenell: band clocks, included dinner, one admission

**Prepared and validated; NOT deployed or applied.** Craig approved the prior
bike-bus cleanup, which is complete. This is the next sequential issue.

## Actual source and decision

Source `1734842218648626`, October15 row251, advertises **Small Business Big
Party** at Rodd Brudenell River Resort on **November28**. Caption and the
independently inspected original poster assign **9:00PM–12:30AM to Vintage2.0**.
The **$86.95+tax per-person dinner-and-entertainment ticket** includes buffet
dinner; no dinner serving time is printed. Optional overnight packages include
accommodation and next-morning breakfast, with their own advertised prices.

Existing canonical:
`venues/mke7HhKpmcxbnpV2tuzg/events/u0UWyWPeqU5IKF0SiWvs`.
It is incorrectly titled **Buffet dinner** while using the band's21:00–00:30
window and Live Music category. No second same-date venue listing was found.

Keep one **Live Music** card, accurately named **Vintage 2.0 — Small Business
Big Party**. Preserve its November28–29 overnight clocks and $86.95 ticket.
Explain in the description that the clocks belong to the band, dinner is
included, dinner serving time is unknown, and overnight options are separate.
Retain the original poster, identity, venue, category, flags, source arrays,
social counts and every field outside the exact patch. No duplicate meal card.

## Cause and narrow prevention

The existing auxiliary poster-theme remapper treats included “Buffet dinner”
and “Buffet breakfast” lines as named programme themes. Its broad matching can
replace the party/performer identity and carry the entertainment clock into
the generic meal item. The terminal saved extraction contains
`extractionReason=poster_theme_dates`; original paid pre-remap output is not
claimed available. Source playback reproduces the incorrect refinement gate.

Prepared runtime changes:

- `eventExtractor.ts`: explicitly headed package-inclusion bullets/plain
  components cannot become theme-date remapping candidates. Real separately
  named theme blocks retain their existing path.
- `sourceItemEvidence.ts`: a single generic meal/whole-party placeholder can
  bind to the caption's uniquely named entertainment only when a shared
  dinner-and-entertainment admission, one matching source date and matching
  explicitly printed band clock range establish the role. Genuine independent
  meal clocks, separate admissions, multiple ranges/items, another date,
  unnamed acts and recurrence remain protected. Retain the supplied amount as
  ticket price, source index/image/date/clock identity and a source-title proof.
- Seven focused regression cases in `sharedAdmissionEntertainment.test.ts`.

No model/effort/allocation, request prompt/cache layout, compact-response
contract, SDK/dependency or global date-only publication change.

## Exact release package

Coordinator source commit `2e12df2d7f3403f563cc5c02c511f1eb47cd8795`.
Release **`731bafc6dbe6f0400245ced4ac5134600b808b52`**, prepared from the exact
serving `2ce92a7` baseline in
`C:/Users/craig/.codex/worktrees/arts-mixer-release/gathr-apps-script`, branch
`codex/shared-admission-release-20261015`. Only the two reviewed runtime files
and their test are included; their source matches the tested coordinator
commit exactly. Separate festival-shadow code is excluded. Existing unrelated
private artifacts remain outside the package/ignored.

Fresh independent readback confirms all three functions ACTIVE/100% latest
traffic at common pre-release hash `c8f778d960e9fd45d2efd5624d0b5b3b1411fb84`:

- `processdataset-00487-tes` (northamerica-northeast2).
- `processdatasetresume-00451-jan` (northamerica-northeast1).
- `processdatasetselectedrows-00443-kas` (northamerica-northeast1).

Actual Stage1/2/3 routing pilots remain enabled at100%; legacy default override
names in environment readback are not evidence of actual Mini/GPT5.2 calls.
Stage4 remains Nano low and Stage5 Luna none. Full runtime/environment/secret
configuration fingerprints are saved without raw secrets. Date-only gate stays
OFF. The dataset is complete, no checkpoint exists and no parser lock is active.

After approval, fresh preflight/readback, exact clean tracked source and the
established narrow three-parser deploy are required. Then independently prove
ACTIVE/latest100%/one common new hash and identical full configuration
fingerprints. No full-function deploy, queue action, API or OTA release.

## Passed validation and limits

- Release build and **816/816 full compiled backend tests** pass from the
  required functions working directory. First root-directory invocation failed
  on a relative fixture; corrected invocation passes every test.
- **20 focused source/theme/time controls** pass, including seven new cases.
- Offline paired replay of **72 nonempty source posts/184 extracted items**
  changes only row251: correct named entertainment identity and no package
  theme remap. Price/clocks/inventory remain intact. Stage5 metadata rehydration
  preserves the new source title and music/event classification.
- Future same-occurrence/merge playback matches the corrected keeper despite
  a new normalized item identity, without changing title/date/start/price.
- These use captured source/local responses, zero paid calls. They do not
  establish fresh model latency or a future full-run quality pass.
- Codebase-qualified three-parser Firebase **deployment dry run passed**.
  Existing outdated firebase-functions advisory remains; dependencies unchanged.

Private evidence: `functions/artifacts/oct15-sequential-repairs/rodd-party/`,
including `cohort-playback.json`, `future-merge-playback.json`, `release-build.txt`,
`release-full-tests.txt`, `release-dry-run.txt`, `serving-before.json` and the
coordinator's `functions/artifacts/shared-admission-focused.txt`.

## Exact two-document live repair

Default-dry helper `firebase/repair-rodd-entertainment-oct15.mjs`:

- Change `eventName`/`name` to the source-grounded band/programme title.
- Replace description with explicit music-window ownership, included dinner,
  printed optional room rates and source booking contact.
- Correct internal `_sourceType` special->event and time evidence/resolution
  to describe entertainment. Preserve actual clocks, dates, prices, category,
  venue, ID, all media and other fields. Server `updatedAt` only additionally.
- Atomically advance **`runtime_metadata/event_feed` 263 -> 264**, timestamp
  only otherwise.

Exact reviewed plan and complete backup:

- `functions/artifacts/oct15-sequential-repairs/rodd-party/plan-2026-10-15T21-23-14-216Z.json`.
- Matching `backup-2026-10-15T21-23-14-216Z.json`.

Fresh dry run verified the unchanged source/target/venue/marker and one related
event. Apply requires exact approved prevention hash ACTIVE on all three
parsers, fresh source/poster/target/sibling/version checks, idle-parser guard
and a full prewrite backup. Any drift aborts. No new event, upload or deletion.

Independent verifier `firebase/verify-rodd-entertainment-oct15-readonly.mjs`
checks exact two-document delta, all untouched references/siblings, default and
capable details, active/history full feeds once, no included-meal duplicate,
same source clocks/price/gallery, images200 and API marker264.

Retain prior source/revisions/configuration for rollback. Code rollback must
use the separate serving baseline; do not automatically restore the misleading
meal identity. Next full-run audit must inspect this source and genuinely
independent meal/programme controls. Other recoveries and festival publication
remain separate work.

## Approved execution and independent verification

Craig explicitly approved this exact release/repair. Completed October15
21:34UTC. Release `731bafc6dbe6f0400245ced4ac5134600b808b52` was narrowly
deployed from the isolated `arts-mixer-release` checkout after the fresh idle
preflight. All three parsers are independently ACTIVE with100% latest traffic
and common source hash `15a93b64dc5ce4d892adfe5b52d3d46c0ff9ad06`:

- `processdataset-00488-vud`
- `processdatasetresume-00452-pog`
- `processdatasetselectedrows-00444-kaj`

Full function/runtime/environment/secret-binding fingerprints and visible model
settings match the before capture. Global date-only publication remains OFF;
unshipped festival modules were excluded. Build,816 full tests,20 focused
controls and source/merge playback evidence above remain the release gates.

The exact event patch and feed marker263->264 were then applied atomically,
with the reviewed plan, unchanged-source/sibling guards and fresh full backup:

- `functions/artifacts/oct15-sequential-repairs/rodd-party/prewrite-2026-10-15T21-33-52-818Z.json`
- `functions/artifacts/oct15-sequential-repairs/rodd-party/applied-2026-10-15T21-33-52-818Z.json`
- `functions/artifacts/oct15-sequential-repairs/rodd-party/independent-verification.json`
- `functions/artifacts/oct15-sequential-repairs/rodd-party/serving-after.json`

Independent verification at21:34:20UTC passed exact delta, two untouched
references, unchanged sibling membership, both detail routes200, one listing
in the full989-event/10-page active feed and full1122-event/12-page history
feed, no second included-meal card, both managed images200 and API marker264.
Original November28 21:00–November29 00:30 entertainment clocks,86.95+tax
admission, venue, source identity and gallery are preserved. Dinner serving
time remains explicitly unknown. No media write or additional event occurred.

Craig subsequently requested reviewed batches with short summaries and one
approval per batch, replacing the one-approval-per-issue workflow. Remaining
repairs will be grouped without weakening exact-target/source/drift checks.
