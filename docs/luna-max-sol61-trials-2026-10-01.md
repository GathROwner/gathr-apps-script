# Luna max and GPT-6.1 Sol trials — October 1, 2026

These runs used saved source images and the existing API secret. The full-parser trials used the managed image backend, five parser stages, venue resolution, and dry write-payload previews; they wrote no Firestore events. The isolated Stage 3 trials used the same original source images for each model pair and did not test validation, formatting, venue resolution, or writes. USD figures estimate standard API token charges from each trial's recorded usage and the linked official model prices; they are not invoices and exclude infrastructure.

## Official model settings and rates

- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) supports `none`, `low`, `medium`, `high`, `xhigh`, and `max`. Standard rates per million tokens: $0.10 input, $0.01 cached input, $0.50 output.
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) supports `low`, `medium`, `high`, `xhigh`, and `max`; `none` is unavailable. Standard rates: $2.00 input, $0.10 cached input, $10.00 output. Compared with [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), its uncached input/output rates are unchanged; cached input is $0.10 rather than $0.20.
- [GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2) lists $1.75 input, $0.175 cached input, and $14.00 output. Thus Sol 6.1 is cheaper on output than 5.2 but dearer on uncached input; actual workflow costs depend on tokens and retries.

## Source-matched observations

| Source and route | Measured model cost | Result | Decision |
| --- | ---: | --- | --- |
| Montague Curling Club, Luna `max`, full managed dry run | $0.03183 | 28 Stage 3 items, 23 final dry payloads. Two sign-up records share a title and are miscategorized `Live Music`. Five Thursday sessions shifted to November 26 and lost recurrence; only 13 of 23 final records are marked weekly. | Does not clear the seasonal-board gate. The existing gate was bypassed **only in this local trial** to observe max; that bypass was removed afterward. |
| Landmark Oyster House, Luna `max`, full managed dry run | $0.01156 Luna attempt; $0.07339 including legacy retry | Luna extracted seven offers, formatted five, then failed `caption_only_weekly_source_mismatch`. The final three records came from the legacy retry. | Max did not fix this source. The retry adds cost without a Luna quality gain. |
| Montague, Sol 6.1 `high`, Stage 3 only | $0.15511 | 32 proposed items, including inferred first dates and no recurrence pattern. | Not publication-ready; this one stage cost nearly as much as the local full legacy retry ($0.16549). |
| Montague, Luna `high`, same-source Stage 3 control | $0.01012 | 35 proposed items; count does not establish publishable recurrence or correct first dates. | Sol 6.1 cost about 15.3 times as much for this stage, without an established quality benefit. |
| Pints East Bay Boogie, Sol 6.1 `high`, Stage 3 only | $0.05825 | Nine separate acts and activities proposed from the three images. | Over-splits the festival for the app; no later-stage test was run. |
| Pints, Luna `high`, same-source Stage 3 control | $0.00156 | Two app-level listings: the festival and separate offsite market. | Sol 6.1 cost about 37.2 times as much for this stage and grouped worse. |

The Montague source image is a weekly league board; a bare item count is not a success measure. Dates, recurrence windows, category, and whether a listing belongs in the app must be checked before any live use. For Landmark, both source images are a food photo and menu; the offers are principally in the caption. The fault is in downstream interpretation and source checking, so more Stage 3 reasoning alone did not repair it.

The first attempted Luna max Montague run followed the existing seasonal-board safety gate and therefore used legacy, despite the max setting. An initial Landmark max run did not activate the calendar grouping prompt because that prompt accepted only `high` and `xhigh`. Both are excluded from the table. The corrected code includes `max` in the grouping prompt and the exact-post canary effort validation. No parser service or Luna environment flag was deployed for these trials; the scheduled parse remains on legacy.

Trial reports are under `C:\Users\craig\.codex\worktrees\luna-pilot-release\pilot-source\`: `montague-luna-max-bypass-dryrun.json`, `landmark-luna-max-corrected-dryrun.json`, `montague-sol61-high-stage3.json`, `montague-luna-high-stage3-sameimage.json`, `pints-sol61-high-stage3.json`, and `pints-luna-high-stage3-sameimage.json`, each with a same-name `.log`.
