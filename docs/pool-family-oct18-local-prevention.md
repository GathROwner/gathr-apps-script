# October 18 public pool family-label omission

## Status

Local prevention and exact repair proposal prepared. **No production deployment,
live correction, replay, model call, queue change or traffic change occurred.**
Craig explicitly warned that the October18 regular large parse is active. Fresh
Firestore readback confirms `processing_locks/1Nwf4lh-reDH0alm37Lvkqu61Shv_mwer`
is `running`. Do not deploy over that parse or apply the proposed data batch.

## Confirmed source-to-app trace

The October18 Bell Aliant Centre card “All pools open”,09:00–11:45, carries stored
score15 / `unlikely` / `insufficient_family_evidence`, version `family-friendly-v5`.
Its detail API also returns15, so the missing badge is upstream of app rendering.
The same source's free swim has v6 score15 and waterslide has v5 score15.

Exact original source `1534850241996227`, posted October16 at13:00:04UTC:
`https://www.facebook.com/100064137963639/posts/1534850241996227`.
Immutable snapshot:
`parse_snapshots/1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g_157_1792242438966`.
Its Sunday October18 caption explicitly prints:

- Charlottetown Y's Club Free Swim —12:00–13:30.
- All pools open —09:00–11:45.
- Lane swim open —09:00–11:45.
- Waterslide open —09:00–11:45.
- Pools closed for swimming lessons —14:00–19:00.

The baby/parent photo is not used as audience proof. The correction follows the
named recreational activity and Craig's children/family-suitability policy.

The actual compiled October17 released v6 scorer still returns15 for all three
public recreation listings. Thus this is an open phrase-coverage weakness, not
just an old score awaiting refresh. Existing v6 handles “Family/Public Swim” but
does not recognize “All pools open”, sponsor-prefixed “Free Swim” or waterslide
access by themselves. Empty bound-audience signals are not supplemented by
gallery-wide OCR or borrowed venue demographics.

## Narrow local prevention

An isolated worktree under
`functions/artifacts/pool-family-oct18/reviewed-parser` starts from the exact
previously verified parser release assembly commit
`fe2aa981034bf37354001ae1b3a7b56431efaec6`. The coordinator checkout's older v4 scorer
was deliberately not used as the implementation baseline. The immutable serving
assembly remains unchanged; dependencies are shared through a read-only-use
directory junction and all generated build files remain in the new worktree.

Candidate v7 recognizes item-title recreational aquatics: all-pools-open,
public/open/recreational/free swim, waterslide open and splash-pad open. It uses
the existing `family_activity` signal (score60 / likely), rather than inventing
an explicit all-ages statement. Existing explicit family/all-ages scores are not
double-boosted. Child lessons continue to qualify through their existing age or
child-participation evidence.

Adult/child exclusions still win. Closed pools, private bookings, adult/senior
sessions, lane/lap fitness without family evidence, unspecified lessons, films,
parties and billiards do not qualify from this new phrase rule. Guardian minimum
ages remain distinct from participant restrictions. Bound formatter proof and
deterministic write-time recomputation retain the result on exact activity
refreshes; unrelated source/gallery context remains ignored.

## Exact proposed data delta — not approved/applied

| Target under `venues/slug_bellaliantcentre/events/` | Activity | Proposed score |
| --- | --- | --- |
| `fVAKIJWmV21ICSTELKVY` | All pools open, October18 09:00–11:45 |15→60 |
| `jjOj9C8U4xuOe87fdmGV` | Charlottetown Y's Club Free Swim, October18 12:00–13:30 |15→60 |
| `VdoL6qZ6gnFo3Sw99I4R` | Waterslide open, October18 09:00–11:45 |15→60 |

Each patch contains only the five computed family fields plus `updatedAt`;
`runtime_metadata/event_feed` would advance once from its freshly pinned value.
Lane swim `nxpA2g7yHOxsLH4Etr3F` is an unchanged control (score15). All IDs, source
evidence, dates, clocks, descriptions, primary Sports categories, venues, media
and engagement stay unchanged. No new occurrence or expiry extension is proposed.

The private proposal pins all three full target hashes/update times, the exact
source snapshot and the same-source sibling control. After the parse, reread all
versions and siblings, abort on drift, confirm no parser/checkpoint remains,
back up full documents to `firebase/artifacts/pool-family-oct18/`, then apply only
the exactly approved atomic delta. Verify details and the complete active feed;
expired activities must not be redated just to demonstrate a badge.

## Release boundary and remaining work

Do not apply the score refresh before the new scorer is serving, since an older
writer could recompute it back to15. Prepare each publishing function from its
own freshly verified immutable baseline: three parsers, city-review finalizer,
shared-public candidate processor and scheduled shared-public candidate processor
are the six writers covered by the earlier family release. Reconcile their
actual current source/configuration and accepted policy differences before a
narrow release; this local parser patch alone is not a six-function assembly.

Fresh Cloud Functions metadata readback with the existing service account returned
403 for all three parsers. No permission was changed. The historical October17
release verification is retained separately; current serving hashes are **not**
claimed freshly verified. Restored operator Google Cloud sign-in/read access is
required for the later deployment gates. No sign-in interruption was requested
while the active parse proceeds.

The event-integrity-repair skill requires exact reviewed data approval before
these three new live label corrections. Include the correction and release in
the next concise batch after the parse; earlier unrelated repair approvals do
not cover these new targets. No monitor or automatic apply was created.

## Evidence and validation

Private evidence is under `functions/artifacts/pool-family-oct18/`:
`live-readonly.json`, `source-readonly.json`, four detail captures,
`api-readonly-summary.json`, `saved-source-playback.json`,
`reviewed-repair-proposal.json`, `runtime-readonly.json`, `safety-after.json`.

Build and final focused QA pass62/62, including actual title/clock fixtures,
adult/private/closure/guardian/film/party/lesson controls, refresh recomputation
and the real formatter's bound evidence path. Saved live-document playback
proves all three15→60 changes and the unchanged lane score. Full compiled QA is
recorded separately in `full-tests.log` and final QA result JSON.

Fresh after-readback confirms the parse is still running and all four Bell
Aliant event document versions are unchanged from the initial capture. Local
preparation does not mean today's active parser includes this new rule.

Final validation: **62/62 focused and 1,000/1,000 compiled backend checks pass**,
zero failures/skips. Candidate commit `fc5fd65e9788f087a91062c9c8aa1fa86524b48f`; reconstructable two-file
patch `release-patches/oct18-family-aquatics.patch` applies with
`git apply --unidiff-zero` in a function-assembly root. `final-qa.json` pins the baseline/candidate and results. This is local-only
proof, not production release or existing-record repair completion.
