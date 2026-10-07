# October 7 live parse latency diagnostic

Read-only investigation during the active regular dataset `1eREpzt2nL6mpIX9St-GoKOvTDrdX4WwU`, run `c5614424-e270-4af6-9e34-8eb3d58afaf7`. No parser code, queue, traffic, or live records were changed.

At 14:38 UTC the checkpoint was row 267/377, the processing lock was running with a heartbeat about 23 seconds old, the processed-dataset marker was absent, and the batch reported zero error rows. The run began at 12:39 UTC. For comparison, the October 5 completed run processed 351 rows between 12:39 and 14:33 UTC; its final batch had 107 `parse_full5stage` timings. Today's run already had 101 such timings by 14:31 UTC, before completing all rows. These datasets differ in post mix, so row throughput alone does not isolate a model effect.

The dominant observed delay was Bell Aliant Centre row 172, source post `1525045012976750`. Its five-stage parse took 703.5 seconds: Stage 1 8.1, Stage 2 7.6, Luna high Stage 3 33.0, nano Stage 4 60.7, and nano Stage 5 591.3 seconds. Stage 5 batching **did apply**: the 15 validated items were sent as batches of nine and six. The six-item call took 470.3 seconds, consumed 35,232 total tokens according to its response log, and yielded zero usable formatted items. The existing count guard split it into two three-item retries (67.9 and 53.2 seconds); all 15 items were ultimately formatted and row 172 logged 15 created events, zero updates, and zero duplicate events. Its Stage 5 usage summary totals four nano calls, 12,393 input tokens and 50,632 output tokens. The runtime permits up to 32,000 output tokens per Stage 5 Responses call with medium reasoning effort. Token-budget exhaustion is a plausible explanation for the zero-item call, but the log does not expose the response's completion status or per-call reasoning/output breakdown; do not state it as proven.

Through 14:31 UTC, current-run `stage5_format` timings totalled 2,344 seconds across 35 posts, including this 591-second outlier. The entire October 5 run totalled 1,612 seconds across 42 posts. Current-run Stage 3 extraction totalled 767 seconds across 57 posts versus 867 seconds across 60 posts in the October 5 run. These are summed call durations and can overlap where batches run concurrently; the Bell Aliant row's wall time is the stronger evidence. Current venue-match, dedupe, and write timings were individually short in the inspected logs; no stale lease or checkpoint stall was observed.

After the full run finishes, inspect Stage 5 response status and token details for this row and any other long/empty batch. Test a bounded Stage 5 output budget or smaller initial batches against saved dense rows, preserving all source identities and item counts. Compare total wall time and field quality before changing production. Keep the active run untouched and audit its final writes/holds when complete.

## Required instrumentation before dense-row replays

Add structured, content-free telemetry for **each** Stage 5 Responses call, including retries. Correlate it with the run ID, source post ID, row, batch offset and item count, model, call duration, and response ID. Record `response.status`, `response.incomplete_details?.reason`, the requested `max_output_tokens`, and `usage.input_tokens`, `usage.output_tokens`, `usage.output_tokens_details.reasoning_tokens`, and `usage.total_tokens`. Also record visible output length, parsed item count, parse error category, and whether count or source-identity validation triggered a split/retry. Never log the prompt, response text, or secrets.

Do this **before** rerunning Bell Aliant row 172 and the other large rows, so an empty result can be distinguished from output-budget exhaustion, invalid/truncated JSON, or a response-extraction failure. For row 172, the 35,232 tokens logged for the failed six-item call are **input plus output**; they do not alone prove that its configured 32,000 output-token cap was reached. Confirm a cap hit only when the response reports `status: incomplete` with `incomplete_details.reason: max_output_tokens` and the per-call usage supports it. Then compare the baseline with a higher cap and/or smaller batches, measuring complete item coverage, source identity, wall time, and token cost. Do not raise the live cap blindly during the active parse.

## Single-item Stage 5 latency, rows 321–329

Read-only Cloud Logging and `parse_snapshots` review while the same run remained active. Rows 321–329 advanced between 15:22:32 and 15:33:07 UTC. Only five reached Stage 5; two failed Stage 1, two were invalid/empty, and row 324 produced no final event. Each Stage 5 duration below was one GPT-5 nano Responses call (no Stage 5 retry), and its API call duration matched the measured Stage 5 duration closely.

| Row | Final events | Stage 4 | Stage 5 API | Stage 5 input tokens | Stage 5 output tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| 321 | 3 | 50.6 s | 101.4 s | 2,577 | 4,651 |
| 322 | 1 | 9.2 s | 49.9 s | 2,202 | 4,866 |
| 324 | 0 | 17.6 s | 27.3 s | 2,177 | 4,420 |
| 325 | 1 | 57.7 s | 47.6 s | 2,216 | 5,597 |
| 328 | 1 | 9.7 s | 91.6 s | 2,454 | 4,111 |

Those five Stage 5 calls consumed 317.8 seconds, and Stage 4 consumed another 144.8 seconds. Stage 3 for the same posts took about 41 seconds in total. This is a general single-item latency issue, distinct from row 172's possibly exhausted 32,000-token output budget: the calls above used only 4,111–5,597 output tokens each. The current usage summary does not split visible JSON from hidden reasoning tokens, so do not attribute the excess solely to reasoning until the instrumentation above is deployed.

The current Stage 5 prompt has repeated venue instructions, requests time flags absent from its strict output schema, and asks for `formattingDecisions` explanations even though the formatter's returned event path does not consume those decisions. Each formatted event must also include 21 required fields. These are concrete simplification candidates, but their contribution to latency and field quality needs an isolated comparison. After the active run, replay these saved rows plus dense controls with response-status/reasoning-token logging; compare the current medium-reasoning prompt against a lower-effort and a shorter-output variant, preserving exact counts, source identity, recurrence, dates, times, venues, links, and images. Do not change the production parser during the active run.

## Historical Stage 5 comparison

Cloud Run revision readback confirms `gpt-5-nano`, `STAGE5_RESPONSES_REASONING_EFFORT=medium`, and `STAGE5_RESPONSES_MAX_OUTPUT_TOKENS=32000` on September 9, September 19, September 28, October 1, October 3, October 5, and October 7. The medium setting did not begin with the Luna canary.

Production `stage5_format` logs show median single-item durations of 21.2 seconds on September 24 (38 calls), 23.0 seconds on October 5 (27 calls), 33.3 seconds on October 6 (32 calls), and 47.6 seconds on October 7 through this check (41 calls). Matching regular-run `parse_snapshots` show median Stage 5 **output** tokens for single-final-event, one-call rows of 2,855 on September 24 (34 rows), 2,764 on October 5 (23), 4,018 on October 6 (28), and 4,111 on October 7 (34). Median input tokens decreased from 2,805/2,815 to 2,264/2,237. Daily source mixes differ and there were only two exact-source single-event pairs between the October 5 and October 6 samples, so these are strong trend evidence, not an isolated causal test.

Commit `d4d463e`, deployed around 18:09 UTC October 5 after that day's regular parse, changed Stage 5 Responses from embedding the JSON schema in the input prompt to using the API's strict `text.format: json_schema`. It also changed response parsing and batch recovery. The later median output-token and latency increase begins with the October 6 regular run. This is a concrete change-point hypothesis, not proof that the schema change caused the slowdown. The frozen-input diagnostics below separate reasoning from visible output, but they do not compare the old and new request shapes directly.

## Frozen-input response diagnostics after the October 7 run

All comparisons below are local no-write API calls from saved Stage 3 or Stage 4 items. They do not modify production events. Per-call response status, incomplete reason, requested output cap, hidden reasoning tokens, visible output size, parsed count, and batch offset/count were captured. The October 7 production six-item outlier cannot be retroactively assigned a completion status; its 35,232 **total** tokens do not prove the 32,000 **output** cap was reached.

| Frozen input | Stage / effort / output shape | Wall time | Output / reasoning tokens | Result |
| --- | --- | ---: | ---: | --- |
| Eastern Kings six ice slots | Stage 5 medium, current schema | 62.9 s | 8,221 / 6,400 | Six parsed; four finite parents after deterministic recurrence collapse. |
| Same six | Stage 5 low, current schema | 16.2 s; repeat 14.6 s | 2,021 / 704; repeat 1,729 / 384 | First call parsed six but final formatting returned zero; repeat produced the same four parents as medium. Too unstable to promote solely from this pair. |
| Same six | Stage 5 medium, no unused decision explanations | 28.2 s | 4,082 / 3,136 | Same four final records; one sample is not enough to attribute the speed change to shorter output. |
| Same six | Stage 5 minimal, current schema | 12.4 s | 1,488 / 0 | Same four final records, including dates and start times. |
| Bell Aliant 15 source items | Stage 4 low, live setting | 40.4 s | 4,789 / 576 | Kept all 15. |
| Same 15 | Stage 4 minimal | 61.3 s | 4,211 / 0 | Kept the same 15 names, dates, starts, ends, and image indexes; **slower** despite no reasoning tokens. Keep live Stage 4 low. |
| Bell Aliant 15 validated items | Stage 5 medium, current schema | 105.2 s | 14,423 / 10,752 | Nine-item and six-item calls completed; 15 final records. |
| Same 15 | Stage 5 medium, no decision explanations | 79.9 s | 9,975 / 8,000 | 15 final records; still substantial reasoning time. |
| Same 15 | Stage 5 minimal, current schema | 24.4 s | 2,847 / 0 | 15 final records; names, dates, starts, recurrence and source indexes match medium. Three pool-access categories changed from Sports to Gatherings & Parties. |
| Same 15 | Stage 5 minimal, no decision explanations | 18.2 s | 1,988 / 0 | 15 final records; same basic inventory, with the category risk above. |
| Sport PEI five virtual course sessions | Stage 5 medium / minimal, current schema | 46.6 s / 9.0 s | 5,289 / 3,648 vs. 927 / 0 | Both returned the same four finite records, full clocks, virtual venue, image index, and registration URLs. |
| One Sport PEI course | Stage 5 medium / minimal, current schema | 30.4 s / 4.2 s | 3,956 / 3,648 vs. 291 / 0 | Identical final title, date, clocks, category, venue, image index and ticket link. |

The exact Bell Aliant full-parser replay regenerated 15 Stage 3 and Stage 4 items and 15 preview payloads. Its Stage 5 calls completed in 32.7 and 48.8 seconds, with no cap hit or count retry. This did **not** reproduce the production six-item 470-second outlier. The new response diagnostics need to run in production so a future long-tail call can be attributed to `incomplete`, hidden reasoning, malformed output, or external latency rather than guessed from total tokens.

The evidence supports a Stage 5 minimal-effort pilot, but not an immediate global switch: a low-effort call already yielded zero final records once, and minimal changed three pool-access categories on the dense fixture. The content-free per-call instrumentation was deployed in commit `c1a61fe`; the three function revisions and source hash are recorded in `docs/luna-stage3-oct7-100pct-release.md`. Production Stage 4 remains low and Stage 5 remains medium for the first 100% Luna Stage 3 full run. After that run, compare minimal on a broader frozen set with source identity, categories, recurrence, venue, images, ticket links, and final write previews; add a bounded medium-effort retry for incomplete or identity-invalid batches before any live Stage 5 effort change.
