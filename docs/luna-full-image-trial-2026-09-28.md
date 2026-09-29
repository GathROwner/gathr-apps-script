# Luna full-image Stage 3 trial — 2026-09-28

## Scope and baseline

- Production project: `gathr-migrated`; large parse file `1aZAr6b6TQ19KrCey_TnA8MKdqnMgtSes`, run `baa95fad-c53e-48c9-acf5-336816fdf7ad`.
- The three highest-cost **distinct source rows**, including repeated parse attempts, were City Cinema (row 156, $0.23316735), Cornwall Public Library (row 255, $0.08787160), and The Inn at Bay Fortune (row 158, $0.08655530). These are estimated OpenAI costs from Firestore usage summaries, not an invoice.
- Production Stage 3 uses GPT-5.2 through Responses. The deployed `STAGE3_MODEL_OVERRIDE` remains `gpt-5.2`; `STAGE3_IMAGE_DETAIL` and `STAGE3_LUNA_FULL_IMAGE` are unset. No parser was deployed or production event written by this trial.
- The current ready revisions recorded during the audit were `processdataset-00421-daq` (northeast2), `processdatasetresume-00385-far` (northeast1), and `processdatasetselectedrows-00265-rub` (northeast1). Recheck them immediately before any future deployment.
- The isolated branch starts at `fac560dcdad7561c790f991c82326d78a37a2c49`. The original dirty checkout was not edited.

## Test method

The three trials used the snapshot's `inputText`, the complete source images in `rowMeta.mediaUrls`, and the production Stage 3 extraction prompts and content types. Images were fetched into memory and sent as Base64 data URLs. Luna used Responses, `reasoning.effort: none`, `detail: original`, and the existing 32,000 output-token cap. No OCR tiles, image uploads, downstream validation, formatting, or Firestore writes were run. The existing Secret Manager key was used in process memory without printing or saving it. Actual response usage, including cache-write tokens, was used to estimate cost at $0.10/M ordinary input, $0.01/M cached input, $0.125/M cache writes, and $0.50/M output.

The historical comparison below uses one matching snapshot per row; repeated historical attempts are included in the row totals above but not charged to a single Luna trial. GPT-5.2 cost uses $1.75/M input and $14/M output. The production and trial image inputs differ intentionally: the question is whether one complete image can replace OCR tiles. Costs are Stage 3 API costs only.

| Row | Historical Stage 3 | Full-image Luna Stage 3 | Estimated reduction | Extraction review |
| --- | ---: | ---: | ---: | --- |
| City Cinema 156 | 1 call, 43 tiles, 9,532 input / 6,959 output, **$0.114107** | 1 call, 1 image, 1,268 input / 5,528 output, **$0.002922425** | 97.4% | 36 dated items across all nine flyer title groups. Misread **Al Tuck My Blues Away** as **All The Time**. The historical final events also misnamed it as “Alfie Truck.” The flyer has no showtimes; Luna left times blank. |
| The Inn at Bay Fortune 158 | 2 calls, 4 images, 32,494 input / 774 output, **$0.06770050** | 2 calls, 4 full images, 4,942 input / 266 output, **$0.000750600** | 98.9% | One FireWorks Feast item, dated September 27. The post only says select remaining dates through October 10, so September 27 is unsupported. The historical final output had three similarly questionable dated/package entries. Hold for review. |
| Cornwall Public Library 255 | 1 call, 0 images because upload returned HTTP 500, 1,317 input / 1,897 output, **$0.02886275** | 1 call, 2 full images, 2,185 input / 1,602 output, **$0.001074050** | 96.3% | All nine flyer occurrences found, including the September 30 and October 1 pair. The snapshot text already contained a full OCR transcription, so this row is weak evidence of Luna's visual reasoning. Its French `7 h 00` remained `7:00` and needs downstream time normalization. |

Selected historical Stage 3 total: **$0.21067025**. Three Luna trials total: **$0.004747075**, a 97.7% reduction in this small Stage 3 sample. This excludes Stage 1, Stage 2, Stage 4, Stage 5, image handling, retries, and any review work. The historical Cornwall final result contained 71 events after website enrichment; nine Luna Stage 3 items should not be compared to that final count.

Luna is **more expensive per token** than GPT-5 nano ($0.10/$0.50 vs $0.05/$0.40 input/output per million). The workflow can still cost less because it uses many fewer image and output tokens than the present GPT-5.2 tiled path.

## Follow-up: dense September 26–27 calendars

Firestore snapshots for September 26–27 contained a 30-item Downtown Charlottetown row, but its Stage 3 usage was zero, so it cannot serve as a paid tiled-path comparison. Older 20–31 item paid rows had inaccessible source-image URLs; a tiny surviving display thumbnail is not an equivalent full-image input. The densest recent **paid tiled rows with accessible complete source images** were Milton Community Hall (18 historical Stage 3 items), Holman's Ice Cream Parlour (17), and Town of Stratford PEI (17). The Holman's and Stratford posts used the same Fall Fest artwork, so they are correlated quality evidence.

| Row and date | Historical GPT-5.2 Stage 3 | Complete-image Luna Stage 3 | Estimated reduction | Extraction review |
| --- | ---: | ---: | ---: | --- |
| Holman's Ice Cream Parlour, Sep 26, row 231 | 1 call, 43 tiles, 13,278 input / 3,927 output, **$0.07821450** | 1 call, 1 image, 1,485 input / 2,654 output, **$0.001512550** | 98.1% | Luna produced 14 separate items: both Fall Fest days and all 12 timed stage performances. The historical final output had 17, with additional separate records for Holman's ice cream, Keddy's Corn, and the Joggler. Luna did not create those three separate records; the trial did not retain its full descriptions, so this does not prove it failed to read those names. |
| Milton Community Hall, Sep 27, row 261 | 1 call, 43 tiles, 9,352 input / 3,463 output, **$0.06484800** | 3 calls, 1 image each, 3,429 input / 8,134 output, **$0.004167620** | 93.6% | Luna returned 22 items: 16 timed September 28–October 4 schedule entries plus six side notices. Several side notices are administrative, all-day, or future events requiring downstream review. The first calendar response was not accepted by the parser; supplemental OCR and fallback extraction supplied the final 22. |
| Town of Stratford PEI, Sep 27, row 255 | 1 call, 44 tiles, 12,353 input / 3,656 output, **$0.07280175** | 1 call, 2 images, 1,734 input / 2,944 output, **$0.001688675** | 97.7% | The same Fall Fest art yielded 14 separate items, including all 12 timed stage acts, without separate vendor/busker records. The historical run logged 17 Stage 3 items but retained only one final Fall Fest event; the saved snapshot cannot establish which 17 names Stage 3 returned. |

For these three rows, historical Stage 3 totaled **$0.21586425** and the successful Luna trials totaled **$0.007368845** (96.6% less). An initial Milton trial exposed a separate integration defect: supplemental OCR placed the entire Base64 data URL into the text prompt and asked Luna to echo it. That run cost **$0.033351275**, much of it a 32,000-token output, and is excluded from the successful-trial comparison but **included in actual trial spend**: $0.040720120 across four follow-up runs. The isolated code now replaces data URLs with short image references in that OCR prompt. The corrected Milton rerun cost $0.004167620 and took 47 seconds. No production revision changed.

This sample reached 22 extracted Milton items, but it did not establish that Luna reliably reads 20–30 **separate calendar entries** in one pass. Milton needed a fallback pass, while neither Fall Fest trial made separate records for the same three side items. A switch requires a denser accessible calendar and a checked event-by-event comparison, particularly for small peripheral text and completeness.

### Saved final-output comparison, checked after the trial

- **Holman's:** GPT-5.2's final output retained all 12 stage acts, two festival-day records, and three separate side records (Holman's ice cream on Saturday; Keddy's Corn and the Joggler on Sunday). Luna's Stage 3 trial produced the first 14 as separate items. The ice cream and corn are vendor offerings rather than clearly independent events, so counting their absence as three equally severe event omissions would overstate the quality gap. The Joggler is a more plausible missing performance record.
- **Milton:** GPT-5.2's final output had 16 timed schedule records. Luna's 22 Stage 3 items represented all 16 time slots, but its Thursday 7 p.m. item was the generic **“Music – Country Classics”** instead of the named performers **Crystal Paynter & Perry Batten**. Luna also added six all-day/future/side notices, including an office-closed notice and election information, whose event status would need downstream review. This compares different pipeline stages and does not establish how many Luna items would survive final formatting.
- **Stratford:** GPT-5.2's final output retained only one overarching September 26 Fall Fest record. The 17-item Stage 3 log count shows extraction occurred, but the saved snapshot holds only final events, not those raw Stage 3 names. We therefore cannot claim its final pipeline preserved the 12 acts or the three side records on this post.

## Isolated implementation and rollback

- The code recognizes exact `gpt-6-luna` as a Responses model and explicitly sends `reasoning: { effort: 'none' }`. GPT-5.2 request behavior is preserved.
- `STAGE3_IMAGE_DETAIL=original` is accepted for Luna. If the model is restored to GPT-5.2 while that env var remains set, its effective image detail safely falls back to `high`.
- Optional `STAGE3_LUNA_FULL_IMAGE=true` downloads each original source image to an in-memory data URL for Stage 3 and prevents calendar tile creation only when the selected Stage 3 model is Luna and every image is available. It is off by default. If preparing any image fails, the existing tiled path remains available.
- Supplemental OCR now uses a short image reference when the image is a data URL, so its text prompt cannot copy or ask Luna to echo the encoded image bytes.
- The first rollback for a future production switch is restoring `STAGE3_MODEL_OVERRIDE=gpt-5.2`; this also disables the Luna full-image path even if its flag is still set. Restore `STAGE3_LUNA_FULL_IMAGE` and `STAGE3_IMAGE_DETAIL` to unset, then redeploy the affected parser Functions and verify their ready revisions and a bounded parse. If the code revision itself is faulty, redeploy the exact pre-switch source/configuration saved immediately before that deployment. The revision names above are audit-time references, not a future deployment backup.
- Before any production switch, save the then-current source commit, targeted env settings, and all affected ready revisions. Only deploy after separate review of event correctness, because these trials include a title error, an unsupported event date, and Fall Fest side items that Luna did not return as separate records.

Raw local trial reports and source images are in `artifacts/` in this worktree. They contain event data but no API key.
