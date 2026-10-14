# October 14 duplicate-event hardening

Craig resumed the deferred duplicate work. Source baseline: venue-resolution
release `5c3a7a4`, with resolver assembly tooling `a39cac6` preserved.

## Diagnosis and narrow prevention

The latest Bad Event Remover audit contains 34 production-strict pairs among
1,144 documents. Those are review candidates, not 34 authorized deletions.
Six new connected groups are copies across top-level `events/*` and nested
`venues/*/events/*`: Barktoberfest, two SoulCave dates, Two Pianos, Mayoral
Candidates, and Arts Mixer. The regular writer previously consulted approved
root occurrences only for the known Red Shores facility exception.

The writer now also checks approved root one-offs with the exact canonical
venue ID, normalized nonempty address, date, start and compatible event identity.
Both populated room labels must agree. Real spatial/route events and recurring
families are excluded. Multiple keepers, bounded-query overflow and conflicting
end dates/times hold rather than publishing or overwriting. A shared specific
ticket URL can establish identity despite a legacy inferred end; homepages
cannot. Existing approved content is retained; a guarded transaction may append
source IDs/URLs only. Existing Red Shores ticket/relationship behavior remains.

Consecutive public access slots are a separate failure mode: the strict audit
also labeled printed Lane Swim 12:00–13:00 and 13:00–16:00 as a duplicate under
its three-hour tolerance. Shared occurrence guards now protect different
source-supported starts for matching public swim/skate/bookable-ice activities,
including exact-source-ID shortcuts. Unsupported/inferred clocks can still be
corrected; distinct printed sessions must survive.

## Validation

- Build and all 718 compiled backend tests passed; 12 new targeted checks pass.
- Captured real comparison: six approved root/child pairs recognized; Arts
  Mixer retained as a source-end-time conflict. Both actual lane sessions remain
  distinct. No model calls or live writes.
- Fresh read-only production selectors execute the actual venue/date query;
  independently verify the selected keeper/conflict and no active parser.
- Evidence: `functions/artifacts/dedup-oct14/` build, focused/full tests,
  `captured-comparison.json`, `live-selector-preflight.json`, deployment readbacks.

## Data and remaining work

This prevention does not delete or merge existing records. Source inspection,
exact keeper choice, full backups and approval are required for each cleanup.
Arts Mixer end-time disagreement, Back in Black clock conflict, Ann Cleeves
venue disagreement, and the older recurring course/yoga families remain held
for individual source review. The stale September watercolour parent has a
source-bounded recurrence problem and is separately reviewable.

This parser guard cannot fence ad-hoc direct Firestore writes or a later manual
location finalizer that uses another serving baseline. Those writers must
compare both collections before creating an approved root occurrence. Broad
fuzzy matching, automatic cluster deletion and relocation by similar names
remain excluded. Next full-run audit will measure actual duplicate suppression
and protected session completeness before widening matching rules.

## Release gates and rollback

Commit tested source; narrow dry-run and deploy only the three parser functions,
with no active parser. Independently verify common hash, ACTIVE/latest traffic
and unchanged user configuration. Revert this isolated prevention commit if
runtime evidence exposes a false hold; no live-data rollback is required for
the code-only release. The separately serving resolver retains its own release.
