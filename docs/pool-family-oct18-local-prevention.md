# October 18 public pool family-label omission

## Status

Craig approved the exact three-record correction and prevention release after
the active full parse. The run completed at13:33:55UTC (10:33:55 Halifax), with
zero recorded errors, completed lock and processed marker, final batch351/351,
no matching checkpoint and no active parser locks. Completion evidence:
`functions/artifacts/pool-family-oct18/completion-readback.json`.

**Release and correction complete.** All approved target/source/control
fingerprints remained unchanged after the parse. Guarded atomic correction
applied at14:25:58UTC and advanced feed version312 to313. Independent serving
source/configuration and API/feed checks passed. No further approval or repair
is pending for this exact batch.

This completion check confirms the regular run finished; it is not a new
source-by-source quality audit of every record produced by that run.

## Confirmed source-to-app trace

Before correction, the October18 Bell Aliant Centre card “All pools open”,09:00–11:45, carried stored
score15 / `unlikely` / `insufficient_family_evidence`, version `family-friendly-v5`.
Its detail API also returned15, so the missing badge was upstream of app rendering.
The same source's free swim had v6 score15 and waterslide had v5 score15.

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

## Exact approved data delta

| Target under `venues/slug_bellaliantcentre/events/` | Activity | Proposed score |
| --- | --- | --- |
| `fVAKIJWmV21ICSTELKVY` | All pools open, October18 09:00–11:45 |15→60 |
| `jjOj9C8U4xuOe87fdmGV` | Charlottetown Y's Club Free Swim, October18 12:00–13:30 |15→60 |
| `VdoL6qZ6gnFo3Sw99I4R` | Waterslide open, October18 09:00–11:45 |15→60 |

Each applied patch contains only the five computed family fields plus `updatedAt`;
`runtime_metadata/event_feed` advanced once from312 to313.
Lane swim `nxpA2g7yHOxsLH4Etr3F` is an unchanged control (score15). All IDs, source
evidence, dates, clocks, descriptions, primary Sports categories, venues, media
and engagement stay unchanged. No new occurrence or expiry extension is proposed.

The private proposal pins all three full target hashes/update times, the exact
source snapshot and same-source sibling control. All matched during the fresh
dry run and inside the apply transaction. Final batch, processed marker, absent
checkpoint and idle parser locks were checked before deployment and repair.
Full backup: `firebase/artifacts/pool-family-oct18/prewrite-backup-2026-10-18T14-25-56-184Z.json`.
Apply and exact postwrite delta proof:
`firebase/artifacts/pool-family-oct18/applied-2026-10-18T14-25-56-184Z.json`.
The default-dry helper is `firebase/repair-pool-family-oct18.mjs`; the approved
execution used `--apply`. All dates, clocks, venue, source, media and engagement
are unchanged. No deletion, new occurrence or expiry extension occurred.

## Release boundary and verified deployment

The new scorer was deployed and independently verified before the data refresh,
so the six publishing functions cannot recompute these pool labels back to15.
Each function was released from its own freshly verified immutable baseline:
three parsers, city-review finalizer, shared-public candidate processor and
scheduled shared-public candidate processor. The older publishers retain their
own prior v5 policy and formatter interface plus the narrow aquatic rule/version
marker; their v7 marker does not establish an identical entire policy to the
parser's v6-plus-aquatics baseline.

The existing Firebase CLI login supports fresh function/service metadata and
generation-pinned serving archive reads. The separate gcloud session has expired
and the service account cannot read function metadata; neither blocks this
release. No permission or credential was changed and no new sign-in was needed.

Fresh October18 baseline: all six publishing functions ACTIVE/latest100%.
Parser hash `0c06b198eacb9cf32171e0d68fbea89e889a93c3`, revisions
`processdataset-00501-lel`, `processdatasetresume-00465-tub` and
`processdatasetselectedrows-00457-muz`. City finalizer hash
`198a0049c6e64636e4aa54b74776c80262a669b8`; direct shared processor
`2ae937870ac36ada11f2870e429ef421360e916e`; scheduled shared processor
`9c16e50335f311bf84d9f38002999a57f582c296`.

Four isolated assemblies preserve these exact serving archives. All parser
source files match the previous immutable parser release, with the reviewed v7
candidate added. Older publishers retain their own v5 policy and formatter
interface, adding only the aquatic rule and version marker. Their tests exercise
the preserved scorer interface; the newer parser-only formatter helper is not
added to these old baselines. Builds and45 focused checks per publisher pass.
Private metadata, generations, assembly commits and deployment logs are under
`functions/artifacts/pool-family-oct18/release/`.

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

Historical preparation readback confirmed the parse was then running and all
four Bell Aliant documents were unchanged. Deployment and apply waited until
that run had completed; today's completed run did not use the new rule.

Final validation: **62/62 focused and 1,000/1,000 compiled backend checks pass**,
zero failures/skips. Candidate commit `fc5fd65e9788f087a91062c9c8aa1fa86524b48f`; reconstructable two-file
patch `release-patches/oct18-family-aquatics.patch` applies with
`git apply --unidiff-zero` in a function-assembly root. `final-qa.json` pins the
original local baseline/candidate and results. Fresh production completion
evidence follows.

## October18 completed release and API evidence

Project `gathr-migrated`, codebase `gathr-functions`. All six functions verified
ACTIVE, single latest revision100%, configuration/environment/secret bindings
unchanged. The three parsers share hash
`9c1f3208397eff88eb1d9432059001015afea848`.

| Function | Serving revision | Release assembly commit |
| --- | --- | --- |
| processDataset | processdataset-00502-diz | a70d0838d9704d15539252d1a4a1e548882887ca |
| processDatasetResume | processdatasetresume-00466-vis | a70d0838d9704d15539252d1a4a1e548882887ca |
| processDatasetSelectedRows | processdatasetselectedrows-00458-bej | a70d0838d9704d15539252d1a4a1e548882887ca |
| finalizeCityLevelEventReviewTrigger | finalizecityleveleventreviewtrigger-00080-bih | 5871b5b626b7f4004c267e89bd0601e1e2da2a67 |
| processSharedEventPublicCandidates | processsharedeventpubliccandidates-00048-wup | 49481d6123edf952f962fb76af23401683990a9d |
| scheduledSharedEventPublicCandidateProcessor | scheduledsharedeventpubliccandidateprocessor-00050-paf | 37123de73292cb768afe690c8a31795822ad989e |

Commands: `node firebase/run-pool-family-release-oct18.cjs dry-run`, then
`node firebase/run-pool-family-release-oct18.cjs apply`. The runner invokes
`firebase deploy --only` with exact `functions:gathr-functions:<name>` targets,
`--project gathr-migrated --non-interactive`, and `--dry-run` during preflight.
The three parsers deploy together from their one common assembly; each other
publisher has its own one-function deployment. All four dry runs passed, with
fresh idle/data and immutable baseline guards before each actual deployment.

Independent evidence:
`functions/artifacts/pool-family-oct18/release/verified.json`. Four newly
downloaded serving archives match their committed source and compiled scorer.
The only changed source files versus each previous archive are the scorer and
new pool regression test. All273 parser source files match the reviewed
candidate. Models, efforts, prompts and cache/compact contracts retain their
exact previous source/environment. No broad deploy, replay, queue change,
manual traffic alteration or active-run interruption occurred.

All four assemblies built. Fresh parser focused checks55/55, each older
publisher45/45, and fresh full compiled parser suite1,000/1,000 across150 test
files passed, with zero failures/skips. Logs and source parity evidence are in
the release artifact folder.

At14:26:09UTC, all four detail endpoints returned200: the three approved
records score60/likely/v7, lane swim score15/v5. The complete active feed
paginated10 pages/928 events. Each record appears exactly once, with unchanged
dates/clocks and correct scores. All four were unexpired at verification; their
advertised expiry remains unchanged. API evidence:
`functions/artifacts/pool-family-oct18/api-after-verified.json`.
Backend-only correction; no app build, OTA or map/emulator interaction was
needed. The app receives feed version313 on its normal data refresh.

Non-blocking observations: Firebase warned that firebase-functions7.2.5 is
outdated; dependencies were preserved. The first local discovery attempt hit
the CLI10-second timeout before deployment. Retry used
`FUNCTIONS_DISCOVERY_TIMEOUT=60` only in the child deployment process; production
timeouts are unchanged. No new API key, permission change or paid model call was
used for this correction.
