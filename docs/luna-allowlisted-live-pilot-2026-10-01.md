# Luna high allowlisted pilot — October 1, 2026

## Scope and release state

Only `gathr-functions:processDatasetSelectedRows` was deployed to `gathr-migrated` after a build, 16 focused tests, and a codebase-qualified Firebase dry run. The selected service was revised from `processdatasetselectedrows-00353-rl4` to `00354-loj` for code, `00355-hbb` for the three exact post IDs, and `00356-jrw` after removing the Luna flags. The scheduled main and resume services stayed at `processdataset-00434-giw` and `processdatasetresume-00398-nam`, with no Luna flags. The selected queue was empty before and after the live replay.

For exact-ID Luna pilots, the bounded dense-calendar inventory read and guarded additions now default on. An explicit `LUNA_CALENDAR_INVENTORY_AUDIT=false` or `LUNA_CALENDAR_INVENTORY_APPLY=false` disables each part. If any source image cannot be preprocessed or a required managed gallery image is unavailable, the selected row is held for source review with zero event writes. The scheduled GPT-5.2 path is unchanged. This is a safe hold, not source-image recovery.

## Observed runs

| Post and mode | Result | Snapshot / log evidence | Estimated model charge |
| --- | --- | --- | ---: |
| Pints East historical gallery, dry | Held: three source images, zero preprocessed; `preprocessed_image_missing`; no events | run `5fd8b9d4-12bf-4723-8da9-c6a6da93e2d6`, row 273 skipped | Not scored |
| Cornwall Cornfest, dry | 15/15 source-checked timed listings; dense inventory found 15, with one title disagreement and zero applied additions; zero writes | `1yjqqEOctulJcObGboRVelF0ySiiMaEXj_0_1790900626690`; run `5b00084c-285e-47ca-b749-fab0bec095ad` | $0.016827 |
| Confederation Centre Art Gallery, dry | Opening 19:00 and curator talk 18:00 on October 3, both with managed images; zero writes | `1Dqh5RrrFEs2Q5bWMNLbRmQ8ogHEyCa27_99_1790900710571`; run `e8c1ce89-89ba-4486-b396-391a4d9845a6` | $0.004356 |
| Same gallery, live | Two extracted, zero created, two existing docs updated; no duplicate | `1Dqh5RrrFEs2Q5bWMNLbRmQ8ogHEyCa27_99_1790900920347`; run `14315784-4f27-480c-9a10-244934ac83be` | $0.003898 |

The charges apply the [published Luna Standard short-context rates](https://developers.openai.com/api/docs/models/gpt-6-luna) of $0.10/M input and $0.50/M output tokens to snapshot usage without cache discounts. They exclude infrastructure and tax. The Cornfest saved mixed-model legacy estimate was $0.09910, so this repeat is about 83% lower at matching 15-slot coverage; the legacy figure is a historical estimate, not a paired invoice. Pints produced no events and is not counted as a saving.

## Live write audit and rollback

Before the gallery write, the complete existing documents `venues/slug_ccoagallery/events/DkVuLLqIxjIReRGX06cR` and `venues/slug_ccoagallery/events/7YRHUI1zLLMaouW2k65c` were saved to `artifacts/luna-allowlisted-pilot-2026-10-01/gallery-pre-live-backup.json`. Readback is in `gallery-post-live-readback.json`. Both IDs retained their October 3 dates, 19:00 and 18:00 starts, and managed images. A venue collection read found exactly those two SOFT INTERNET THEORY events among nine documents. The replay refreshed image/provenance and timestamps; `timeFlags` and `timeResolution` differed only in Firestore map field order.

Immediate routing rollback is already applied: the selected service has no `LUNA*` flags. The pre-pilot code revision `processdatasetselectedrows-00353-rl4` remains available if code rollback is needed. Do not enable Luna on the scheduled main/resume functions from this pilot alone. Historical inaccessible gallery images still need recovery and a fresh-source test before wider traffic. The six supplied phone-photo calendars remain held out for a frozen evaluation.
