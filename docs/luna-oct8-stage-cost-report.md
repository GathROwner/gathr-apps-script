# October 8 regular parse: model cost by stage

Dataset `1kIx_zGW7BZMf8F55eCYTQYOeYuFq-VLv` completed 368/368 rows. This
report uses the `gptUsageSummary.byStage` values in its 148 saved
`parse_snapshots`, with `byModel` to separate the Stage 3 Luna and GPT-5.2
calls. It is an estimated **USD OpenAI Standard API token charge**, not an
invoice or total scrape/cloud cost. Prices were verified against the official
OpenAI model pages on October 8, 2026.

| Stage | Model | Calls | Input tokens | Cached input | Output tokens | Estimated USD |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | GPT-5 mini | 187 | 1,572,028 | 497,536 | 280,438 | $0.8419 |
| 2 | GPT-5 mini | 79 | 551,709 | 85,376 | 45,324 | $0.2094 |
| 3 | GPT-6 Luna high, eligible images | 97 | 890,792 | 0 | 107,346 | $0.1428 |
| 3 | GPT-5.2, image-ineligible posts | 11 | 17,218 | 0 | 4,482 | $0.0929 |
| 4 | GPT-5 nano | 73 | 201,638 | 0 | 117,389 | $0.0570 |
| 5 | GPT-5 nano | 68 | 185,675 | 0 | 333,586 | $0.1427 |
| Supplemental OCR | GPT-6 Luna | 1 | 3,112 | 0 | 308 | $0.0005 |
| **Total** | | **516** | **3,422,172** | **582,912** | **888,873** | **$1.4872** |

Grouped by requested stage, Stage 3 is **$0.2356**, including both models.
The separate supplemental OCR call adds **$0.0005**. Stage 1 is 56.6% of the
total; Stage 4 plus Stage 5 is $0.1998, or 13.4%.

Rates per million input / cached input / output tokens were: GPT-5 mini
$0.25 / $0.025 / $2.00; GPT-6 Luna $0.10 / $0.01 / $0.50; GPT-5.2
$1.75 / $0.175 / $14.00; GPT-5 nano $0.05 / $0.005 / $0.40. The largest
recorded Stage 3 Luna input was 58,676 tokens, below the model's 272,000
input-token long-context price threshold. No Luna cached input was reported.

Sources: `functions/artifacts/luna-oct8-full-audit/ledger.json` and
`docs/luna-stage3-oct8-100pct-production-audit.md`; official
[GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini),
[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2), and
[GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano)
model pricing. The estimate excludes failed calls without captured usage,
Cloud Run/Functions, Firestore, image storage and transfer, and scraping.
Invoice charges can therefore differ. The Stage 3 source post selected for
anchored-text parsing did not make a Luna vision call.

## Why Stage 1 costs $0.8419

Stage 1 is labeled content validation, but the current prompt asks GPT-5 mini
to inspect every supplied image and transcribe exact event names, dates,
times, and venues for schedules. It embeds the JSON schema in the request,
defaults image detail to `high`, and requests a description plus complexity
signals for every image. This is a substantial vision/OCR pass, not a short
yes/no classifier.

The 148 saved posts made 187 Stage 1 calls. The extra 39 calls are explained
by October 8 Cloud Logs: 30 truncated-JSON retries at a larger output cap,
three retries without images after an image call failed, and six deliberate
full-gallery refreshes for eligible Luna posts whose initial mini pass had
seen only the first four images. The 1,572,028 input tokens cost $0.2811
after accounting for 497,536 cached tokens; 280,438 output tokens cost
$0.5609. The output figure includes any model reasoning tokens, but the
saved Stage 1 usage does not split reasoning from visible JSON.

This is a candidate for a separate Stage 1 simplification experiment after
the Luna quality pass: preserve accurate acceptance and the image/layout
signals the downstream stages need, while avoiding full schedule
transcription and repeated over-cap output. No Stage 1 behavior changed for
this report.

## Next decision

Keep production Stage 5 medium reasoning through the next regular full parse,
which tests the just-deployed Luna and recurrence repairs. In parallel, run a
no-write comparison of the current formatter against minimal reasoning and a
shorter output schema on frozen single-event and dense inputs. Verify event
count, source identity, dates and recurrence, category, venue, image, ticket
URL, response completeness, reasoning tokens, and latency. Prior small
comparisons showed large speed gains with minimal effort but category drift and
one low-effort empty final, so they do not justify a live global switch yet.
