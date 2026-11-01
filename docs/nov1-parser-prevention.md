# November 1 parser prevention candidate

Status: implementation and offline verification in progress; not deployed or applied.
Checkout: `C:/Users/craig/.codex/worktrees/5990/gathr-apps-script`.
Branch: `codex/nov1-parser-prevention`.
Accepted parent: `055b12d97a33d08fe67d727c2f3ae221963816db`.
Production deployment and exact data corrections belong to the coordinator.

## Evidence and first failing layer

The authoritative November 1 audit snapshots, input captions and native update
audit were read directly from `C:/Users/craig/Documents/Codex/2026-11-01/parse-audit/`.
Original Tivoli `141-media-0.img`, rink `305-media-0.img`, disco
`300-media-0.img`, Harmony House `291-sharedPost-media-0.img` and Ontario
`113-media-1.img` were independently inspected. They support the audited field
corrections. The rink itself prints the contradictory clocks; there is no evidence
for converting its PM into AM or inventing U18's finish. No new model call,
scrape, replay or live write was used.

| Finding | First failing layer | Candidate protection and limit |
| --- | --- | --- |
| N01 dense cinema poster | Stage3 image reading confidently gives Nov14/15:30/19:30 instead of Nov16/15:20/21:30; text-only Stage4 repeats it | `eventExtractor.DENSE_SCHEDULE_LOCALITY_RULES` makes horizontal panel borders, independent paired headers and literal minute copying explicit. `sourceItemHoldReason` also holds admitted unreadable clocks. This is prompt/uncertainty hardening, **not proven prevention of confident pixel errors**. The original wrong extraction remains confidently wrong to deterministic downstream checks. No daily second-image pass, model change or new model call was added. |
| N02 inherited continuous film span | `buildDuplicateEventUpdates` preserves an older nonrecurring multi-day end even when fresh calendar inventory supplies separate daily screenings | `shouldCollapseCinemaRunSpan` requires exact title/date/start/venue, same publisher, multiple source occurrences, calendar/schedule provenance, run/showtime prose and no explicit old end. It narrows the matched keeper to its one date and clears an unadvertised end/default provenance. Later dated siblings are untouched; festivals/explicit continuous ends and unrelated publishers remain protected. |
| N03 two-hour disco | `resolveSourceDuration` sees only description and class/program vocabulary; the duration is in the title. Category fallback supplies next-day01:00 | Item-local recreation title durations enter the existing arithmetic/proof path. Stage4/5 preserve the proof and same-day14:30 finish. Existing explicit ends, movie runtimes, arrival offsets and ambiguous components remain protected. Same-time titles alone still do not justify automatic consolidation; the audited cluster requires exact coordinator-owned repair. |
| N04 three Friday copies | Stage3 duplicates Friday three times; Stage4 correctly removes literal duplicates and therefore loses the range | `reconcileCollapsedWeekdayRange` acts before validation. Matching named caption range, exact duplicate item identity, expected weekday/count and independently explicit final day corroborate Nov6/7/8. Missing/conflicting endpoint proof holds the copies; healthy distinct clocks/venues/names are unchanged. No weekly recurrence or store-hours eligibility is introduced. |
| N05 explicit Harmony House held | Source location label includes Hunter River while canonical name includes PEI; exact quoted-location guard rejects that spelling shape | `hasExplicitItemVenueEvidence` allows equal venue base names only with confirmed single-location quote **and exact attendee wording in the source caption**. It does not infer a host from the publisher or an unquoted formatter label. |
| N06 U18 merged into U11/source typo | Division guard is limited to development sessions; source contradictions pass into fuzzy duplicate matching | `hasConflictingDevelopmentSlot` checks explicit U-age identity before development vocabulary; `hasConflictingOccurrenceIdentity` carries it through both selectors and defensive merge. `sourceClockContradiction` holds a same-day zero range and implausibly long ordinary sport sessions without guessing a correction. Explicit overnight/multi-day/full-day controls survive. |
| N07 Ontario branches queued under generic Longos | Stage3/4 retain exact addresses but no province; Stage5 loses branch identity and coverage receives only generic venue | `bindCaptionAttendeeRegion` requires one destination-for-events announcement and the exact item-confirmed address quoted in that same caption. The immutable proof survives Stage4 and restores attendee address/label/province after Stage5. Existing `fullParserEventLocationCheck` rejects ON before venue matching/queue creation. Origin/product geography, unmatched branches and uncertain address quotes cannot supply proof. |

## Related parked cases

- Art Buds sharing Holmans: a gift-card sponsor mention previously cancelled
  `sharedEventRequiresOriginalHost`. An attendee phrase is now required for the
  raw-caption exception; sponsor mentions alone retain the hold. No expired
  event relocation or source rewrite is included.
- Island Hill recap: source/item-bound past celebration plus thanks/recap
  evidence is held by `sourcePublicationHoldReason`; future Sunday hours cannot
  qualify that past activity. Fresh future invitations retain eligibility.
- Toby's admission-conditioned cone: an exact named attraction with unknown
  hours cannot lend the conditional offer a post-time start. The offer preserves
  timing uncertainty. No invented opening or blanket use of venue closing hours.
- Royalty Crossing end-only market: `omittedEndOnlySourceItems` records the
  validated unknown start and explicit17:00 end privately as `stage5OmittedItems`
  when formatting omits it. Snapshot merge/sanitization/budgeting retain this
  bounded inventory. This does not publish or resurrect the market.

## Verification

Initial11 focused checks passed before the final multi-day/parked controls.
Expanded focused set:75/75; final build passes. Full compiled suite in progress.
The initial full run exposed an outdated October12 test expectation: its
caption-only offer has no advertised date/start/all-day window. Exact accepted
baseline `sourceTimeConstraints`, `sourceItemEvidence` and
`sourcePublicationPolicy` modules produce the same `offer_service_hours_unverified`
hold as the candidate. Only that stale assertion is reconciled; the runtime
service-hours contract stays strict. Evidence is retained in
`functions/artifacts/nov1-prevention/baseline-failure-proof.json`.

The full run also caught a new guard-order regression: a collapsed17:00–17:00
field pair with literal `10~5pm` evidence was held before existing source-range
recovery. The source gate now allows that literal recovery; final contradiction
checking runs after recovery, retaining genuine same-day zero-range holds. This
runtime correction requires focused coverage and a full-suite rerun. Initial
failed receipts remain saved rather than overwritten.

The candidate changes no model, effort, cache layout, deployment configuration,
queue policy, scheduler, IAM, video worker, UI, OTA or map behavior. Response reuse
remains outside active source. The original pixel errors and uncertain source
clocks are not represented as automatically solved.
