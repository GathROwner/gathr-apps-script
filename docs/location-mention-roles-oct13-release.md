# October 13 location mention roles repair

## Authorization and baseline

Craig approved the three recommendations after the Jingle & Mingle workflow
review: prevent false separate-location routing, distinguish actual venue from
complex/ticket/organizer context, and preserve the existing manually approved
event during later parses. Implementation uses the accepted parser checkout
`codex/luna-oct11-integrity-repair`, starting commit `3a6ad31`, in
`C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script`.
The unrelated dirty primary checkout and location-review task are untouched.

Fresh preflight verified no active parser, October13 processed marker present,
final batch completed and checkpoint absent. Before release all three parser
functions were ACTIVE with 100% latest traffic and common source hash
`58380c92610b48f9d4058be4c79988d3c0ace273`.

## Source trace and reproduced failure

October9 dataset `1NpfngSPGDDOm9Fb5DcYseMuCe4BdKjGq`, rows131 and177:
Red Shores post1805887057841497 and Eastlink post1708626300787719 used identical
artwork and substantially identical captions for December5, 20:00. The poster
prints **Red Shores Charlottetown** as the venue and separately directs ticket
purchases through **Eastlink Centre box office**. Both link to ticket event28202.

Formatted venue wording differed between the posts. Spatial classification
counted Eastlink/Red Shores and Charlottetown as separate places, and repeated
dated prose as multiple occurrences. Both entered city/area review before venue
matching. Local playback reproduced the false `separate_occurrences` routing
and showed duplicate predicates rejecting original location wording but accepting
canonical Red Shores wording.

The location task already published the approved event at
`events/location_8b000022923eb52b50d35935`, venueId `fb_100052606604879`.
That keeper lives in top-level events; ordinary venue-child duplicate queries
would not find it. This release preserves that keeper rather than migrating it.

## Deterministic changes

- A small verified relationship registry records Red Shores Charlottetown and
  Eastlink as sharing a facility. It does not alias their venue IDs or infer
  ownership/containment from proximity. Evidence:
  <https://www.eastlinkcentrepei.com/plan-your-visit/>.
- Explicit extracted venue placement can select the existing Red Shores ID;
  Eastlink remains complex/box-office context. Ticket outlets and named promoters
  can be supporting mentions. A publisher alone cannot establish the venue.
  Sponsor/logo-only mentions, unknown competing places, relocations and actual
  multi-site/dated-venue evidence cannot use this override.
- Location decisions are computed after extraction, preserved through compact
  validation/formatting, and rechecked before venue matching. No model or prompt
  changes, new model calls, geocoding relationship discovery or frontend changes.
- Repeated date/place text is deduplicated before separate-occurrence detection.
  A city attached to a venue is context; different cities, real tours, routes
  and genuine multi-location sources retain their review paths.
- The known-facility duplicate check queries at most65 top-level records for the
  canonical venue/date. Only an already-approved location-review event with the
  same exact start minute, compatible distinctive title and event-specific ticket
  ID can match. Generic ticket homepages/series URLs cannot establish identity;
  Eastlink's EventId query value is preserved. Multiple matches/query overflow
  hold rather than create. Other rooms and different event IDs remain distinct.
- A matched top-level keeper is reread transactionally. Only sourceUniqueIds,
  sourceUrls and lastSeenAt can change; approved location, clocks, title, ticket,
  scope and media are preserved. Ordinary child merges also retain source
  identities and supporting context. Internal document-path metadata is not
  written into event documents.

## Validation and release evidence

Evidence directory: `functions/artifacts/location-mention-roles-release-2026-10-13/`.
Captured public-source fixtures are in
`functions/src/parsing/__fixtures__/jingle-mingle-location.json`.

The saved-source replay invokes the real writer payload preview and read-only
Firestore duplicate selector for both posts. Both must resolve venue
`fb_100052606604879` and existing keeper
`events/location_8b000022923eb52b50d35935`; the current live document is compared
before/after to prove no mutation. Broader saved playback covers46 posts and143
items. These are deterministic playback/selector checks, not fresh model
extraction or production latency evidence.

Unit/regression coverage includes both captured sources, missing known venue,
standalone Eastlink, unrelated ticket outlet, venue selling its own tickets,
Red Shores used only as outlet, organizer context, sponsor logo, relocation,
unknown complex, real multi-site/tour, duplicated prose, Stage4/5 metadata
retention, separate rooms, ticket-ID distinctions, source provenance and a
transaction test that rejects changed keeper identity and permits only source
metadata writes. Existing backend regressions remain required.

TypeScript build and **658/658 backend tests** passed. The two real writer
previews/read-only selectors both chose the approved Red Shores keeper, with no
live event change. The broader46-post/143-item playback reported zero additional
location classification or normalization changes. These checks include the
transaction source-only patch and identity-drift rejection.

Deployment/result status and exact revisions are recorded below after the final
release checks. Only processDataset, processDatasetResume and
processDatasetSelectedRows may be deployed, with codebase-qualified targets.
Model/effort/allocation readbacks must match the before-release values exactly.
No current live event mutation or manual-review finalization is part of this
release. Remaining unknown venue work stays with the location-review task.

Rollback source baseline: parser source commit `2098f4d`, serving revisions
processdataset-00474-yuc, processdatasetresume-00438-jiv,
processdatasetselectedrows-00430-dav. Rollback does not undo any source-provenance
links written by a subsequent regular parser run.
