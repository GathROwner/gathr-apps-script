# Family-friendly scoring v1

## Decision

`Family Friendly` is a cross-cutting event facet, not a mutually exclusive primary category. A sports event, concert, workshop, cinema screening, or gathering can independently qualify for the facet.

New and updated events store:

- `familyFriendlyScore`: integer from 0 to 100
- `familyFriendlyLevel`: `unlikely`, `possible`, `likely`, or `high`
- `familyFriendlyReasons`: stable evidence and penalty codes
- `familyFriendlyScoringVersion`: `family-friendly-v1`

The app treats scores of 60 or higher as Family Friendly. When a score is present it is authoritative. During the rolling deployment only, an unscored legacy event whose category is `Family Friendly` still matches the facet.

## Evidence model

Strong positive evidence includes explicit family-friendly/all-ages wording, child age ranges, child-focused programs, parent/child attendance wording, and concrete family activities. French and English phrases are supported.

The scorer deliberately does not treat isolated words such as `family`, `children`, or `teen` as sufficient evidence. This prevents examples such as a performer name containing `Family`, `Guardians of the Children`, or `Teen Burger` from matching.

Explicit adult age restrictions and adult entertainment force a score of zero. Alcohol-focused wording and starts at or after 9 p.m. reduce the score but do not override an explicit all-ages statement by themselves.

## Primary category migration

The parser no longer offers or emits `Family Friendly` as a valid new primary category. Legacy output is normalized to a real category, then normal content guardrails can upgrade it to a more specific category.

The read-only backfill script scores all existing event documents and proposes replacing each legacy category with one of:

- Live Music
- Trivia Night
- Comedy
- Cinema
- Workshops & Classes
- Religious
- Sports
- Gatherings & Parties

The script is dry-run by default. Applying it requires both `--apply` and the exact confirmation token, rechecks document freshness, and writes a local backup before committing Firestore batches.

## App behavior

The Family Friendly interest/filter now uses the score across primary categories in:

- map and list filtering
- filter counts and new-content counts
- interest carousel selection
- event and venue priority scoring
- trending-event interest guarantees
- callout and hotspot interest highlighting

The API exposes the four scoring fields at the top level. A server request with `category=Family Friendly` is treated as a score-backed facet filter rather than a Firestore category equality query.

## Rollout boundary

Code, tests, and a read-only live-data dry-run may be completed without changing production data. Firestore backfill and backend/functions/app deployment remain separate approval-gated actions.
