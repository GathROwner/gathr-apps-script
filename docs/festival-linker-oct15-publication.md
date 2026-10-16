# Festival automatic publication implementation, October 15

Status: implemented locally; **no worker deployment, private bootstrap or public
publication applied** by this follow-up. Approval plan:
`docs/inn-and-festival-oct15-approval-plan.md`.

## Live evidence

Fresh serving readback confirms all three parsers ACTIVE, latest traffic100%,
hash8073c2d8a8520e8362a71df53c76b718751fabfb. The regular372-row October15
dataset1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit is complete; the worker's full-run
gate independently rereads lock, marker, final batch and absence of checkpoint.

Fresh registry and source-response playback covered144 unique saved sources.
Seven candidate sources reuse six complete verified captures and one incomplete
capture. The strict matcher finds four eligible canonical children, all already
among17 manually verified Anchor links; five occurrence/provenance/venue holds
remain. No new paid calls, events, reviews, venues or media were written.

`followup-oct15/report.json` records matcher outcomes. The actual publication
worker dry run `publication-dry-run-oct15.json` blocks on the incomplete source,
not an invented successful rollout. The source is the separate Soft Internet
Theory exhibition; original caption and retained images were independently
reviewed. Its fine wall text is not fully readable. The exact nonmembership
proposal excludes it only from this edition and retains that limitation.

`publication-proposed-decision-dry-run-oct15.json` separately tests that proposed
decision using local inputs and fresh Firestore, without applying the decision.
`seed-plan-2026-10-16T01-19-51-395Z.json` contains the seven internal-only create
targets, complete source/authority pins and backup. All artifacts are under
`functions/artifacts/festival-linker-oct15/`.

## Implementation

- `festivalEditionRegistry.ts`: reviewed published editions only.
- `festivalLinkPublication.ts`: pure strict re-resolution, add-only point/link
  patch, manual ownership/removal protection and exact transaction fencing.
- `festivalSourceDecision.ts`: version-bound reviewed nonmembership, never a link.
- `festivalLinkWorker.ts`: bounded capture/cache/claim, full-run proof, current
  canonical/venue inventory, separate private proofs and atomic publication.
- `triggers/festivalLinker.ts`: independent schedule, defaultoff; no parser queue,
  stage model/prompt/cache changes or mobile work.
- Existing evidence extractor and literal caption-scope matcher retain their
  request policies. Historical replay is not new API latency/cost measurement.

## Tests and limits

Sanitized pure and actual-worker database controls cover manual link retention,
source/clock conflicts, no invented points/children, later arrival, duplicate
replay, private-only shadow execution, shadow-to-publish re-evaluation, stale
leases, nanosecond drift, canonical insertions, active parsers, durable bounded
capture, terminal cached errors, manual removal and decision revocation.

Full compiled backend suite and focused worker results:
`functions/artifacts/inn-festival-oct15-full-tests.txt`,
`functions/artifacts/festival-worker-tests-oct15.txt`.
Mocked capture responses in worker tests are not paid API or live-write evidence.

First complete-suite run exposed a new-function secret override conflicting
with the established global secret contract. The override was removed; the
worker now inherits that existing contract. No dependency or SDK update.

Publication remains conditional on exact approval and isolated release gates.
Current real data proposes zero additions. Synthetic new-addition controls
verify mechanics, not an unobserved live rollout. Image-only programme heading
binding and every out-of-contract/ambiguous source remain held. First release
does not automatically remove stale links or claim universal festival discovery.

Coordinator implementation commit9b1ae15, separate immutable worker assembly
1da0d91. Coordinator build925/925 compiled tests and10/10 worker controls passed.
The isolated Inn guard372be0c separately passed851/851 compiled tests and the
qualified three-parser dry run. The proposed-decision live-read/local-playback
worker report passes with144 saved sources,4 already linked eligible children,
5 held outcomes,1 explicitly reviewed nonmember,0 unreviewed capture gaps,
0 public additions and0 paid calls. This is a reviewed proposal, not live activation.
