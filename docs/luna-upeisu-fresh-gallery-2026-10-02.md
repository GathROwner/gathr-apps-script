# Fresh three-image UPEISU October calendar comparison

On October 2, 2026, the original 472 x 590 Facebook gallery for post `1739771728156396` was still accessible. The source inventory in `artifacts/luna-fresh-upeisu-2026-10-02/frozen-source-inventory.md` was written from all three original images before inspecting legacy event names or running Luna. It records 21 visible rows: 18 timed in-person app listings, two online election milestones to exclude, and one council meeting without a printed time to hold. This is a new source case relative to the previously tuned calendar fixtures.

The local runner `functions/scripts/luna-upeisu-fresh-dryrun.mjs` used the saved post caption, timestamp, and ordered gallery; recreated Cloud Run's Sharp OCR transform for each image; mocked image uploads and deletion; and called the current exact-post Luna high five-stage parser. Firestore was read only. Raw per-call usage, extracted items, image provenance, and final events are in `artifacts/luna-fresh-upeisu-2026-10-02/luna-high-dryrun-r1.json` and the two repeats through `r3`. Separate dry-write previews are in `payload-preview-r1.json` and `payload-preview-r3.json`. These tests did not create or update an event or Cloud Storage object.

| Measure | Saved mixed GPT-5.2 run | Luna high first run | Luna high hardened repeat |
| --- | ---: | ---: | ---: |
| Printed rows found at extraction | not independently scored | 21 / 21 | 19 / 21; both election notices were omitted by the model |
| Timed in-person source listings in final parse | 14 / 18 | 18 / 18 | 18 / 18 |
| Online election milestones retained as events | 1 | 2 | 0 |
| Council entry without time retained | 0 | 0 | 0 |
| Final parse records | 15 | 20 | 18 |
| Exact original gallery image selected | inconsistent in saved run | 20 / 20 | 18 / 18 |
| Dry-write payloads produced | not rerun here | 18 / 20 | 16 / 18 |
| Model token estimate, uncached Standard USD | $0.23056 | $0.01609 | $0.01598 |

The four in-person listings absent from the saved legacy final parse are October 9 Panther Friendsgiving, October 10 Monster High Drag Show, October 19 Mayoral Candidates Mix & Mingle, and October 30 Halloween Pub. Luna preserved all four in all three runs. The first Luna run used 55,248 input and 21,124 output tokens across eight calls. The saved legacy run reported 26,300 input/3,683 output on GPT-5 Mini, 46,702/9,053 on GPT-5.2, and 12,128/18,858 on GPT-5 Nano. At current listed Standard rates, the first run is an estimated 93.0% model-cost reduction. The third run used 54,127 input and 21,133 output tokens, including 40,576 reported cached input tokens; its estimate is $0.01598 without a cache discount or $0.01233 with the published cached-input rate. These are usage-based estimates, not invoice amounts; the runs are different executions and exclude infrastructure and tax. [OpenAI Luna pricing](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2), [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini), [GPT-5 Nano](https://developers.openai.com/api/docs/models/gpt-5-nano).

Two release gates are clear:

1. The first Luna run promoted online election voting start/end notices into two-hour physical events at UPEISU. The saved legacy result also retained voting start, so this is a shared eligibility weakness. A general exact-post Luna safety rule now holds administrative voting/registration/application/nomination start or end notices with remote evidence and no physical place. A website in `spatial.locations` is not treated as a physical place. Build and nine focused tests pass. The second full-path run exercised the first version of this rule and held one milestone; the other represented `myupei.ca` as an online spatial location. The final rule removes both from that saved result in offline replay. The third full-path repeat returned exactly the 18 source-worthy listings and zero online milestones, but its primary extraction had already omitted the two milestones, so it did not exercise the final guard. This code is not deployed.
2. The dry-write preview could not resolve `The UPEI Turf` for October 3 or `Day Lounge` for October 29. Both are real source listings. The other 16 hardened-repeat preview payloads were produced. Location resolution must preserve a correct campus room/field association or hold these entries explicitly before any live pilot.

The source states only start times for the October 3 Go! Experience and October 10 drag show. Luna's two-hour ends are labeled parser defaults, while the saved legacy output assigned 11 PM to the October 3 event. Neither end time is printed. Luna's final records kept all calendar entries nonrecurring; the saved legacy result incorrectly marked the October 7 financial literacy workshop weekly. This reinforces the existing code-side recurrence gate.

Do not enable broad Luna routing from this one blind gallery. The next step is a campus venue-resolution review for room/field labels and one more fresh layout case with a dry-write preview. The exact-post Luna pilot can then be judged on source-worthy records and write eligibility rather than final parser count alone.
