# October 2 Stage 3 Luna substitution audit

## Scope

The previous 87-post cohort changed **every** modeled parser stage to GPT-6 Luna. That was not the comparison Craig requested. This replay keeps GPT-5 mini for Stages 1–2 and GPT-5 nano for Stages 4–5. It substitutes GPT-6 Luna high only where GPT-5.2 handled Stage 3 extraction and its OCR debug read. GPT-5.2 retry is disabled. The replay uses the saved caption, ordered source gallery, local Sharp preprocessing, and mocked image uploads; it makes no event writes.

The selected sample is 40 deterministic representative posts, eight posts with the most saved listings, and the next 40 deterministic representative posts from the October 2 completed parse. One of 88 source galleries could not be recovered. The 87 comparable posts have no GPT-5.2 calls. A corrected, separately preserved rerun of row 325 is included in the primary score after the Side Door schedule prompt and deterministic recurrence repair.

## Primary result

| Measure | Saved production output | Stage 3 substitution |
| --- | ---: | ---: |
| Comparable posts | 87 | 87 |
| Posts with listings | 37 | 36 |
| Parser listings | 182 | 188 |

The listing total is not a recall score. Saved output includes at least one marathon sponsor post with two 08:00–23:00 day listings where the source caption gives no start time; the Stage 3 substitution held its untimed item. Conversely, the candidate saved zero from a 15-listing UPEISU calendar in the primary run because the unchanged mini Stage 1 produced malformed JSON on its image call, then its text-only retry rejected the calendar. That is an upstream validation failure, not evidence Luna failed to read the calendar. A separate repeat is recorded below, rather than silently substituting a favorable run into the primary score.

## Cost

At standard uncached API rates, the candidate replay cost is bounded above by **$0.842685** across all 88 attempted posts: **$0.520260 mini**, **$0.123737 Luna**, and **$0.198688 nano**. These are calculated from recorded per-call input and output tokens. Cache discounts, Cloud Run, storage, and other vendor costs are excluded. Saved production snapshots do not have per-call usage, so the actual GPT-5.2 baseline bill cannot be reconstructed. Applying GPT-5.2 list rates to the candidate's *Luna Stage 3 token counts* would be $2.777661 for that stage versus $0.123737 on Luna, but this is a token-normalized illustration, **not** a measured legacy cost or savings claim.

Prices: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini), [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano), [GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2).

## Notable source checks

- Row 325, Side Door Studio: the first mixed run missed three timed classes because Stage 3 left their dates empty. The dated schedule prompt recovered three classes. A formatter regression then treated the year in the pass-validity date as extra occurrence days and demoted two classes. After repair, a full dry run produced Tai Chi, Contemporary Dance, and Beginner Belly Dance as weekly classes ending October 31. Earlier row results are preserved under the named Side Door run directories.
- Row 319, PEI Marathon sponsor spotlight: caption says October 16–18 and links registration, without a start time. Luna returned an untimed weekend item; nano rejected it. The saved output's 08:00–23:00 day listings need source corroboration before treating this as a candidate miss.
- Row 209, UPEISU October calendar: the primary mini Stage 1 image response hit its 2,000-output-token cap and left invalid JSON; its text-only retry then rejected the otherwise event-rich gallery. A second run with unchanged code passed that retry and produced 18 listings versus 15 saved, demonstrating run variation. A narrow reliability fix retries truncated validation JSON with the same images and a 4,000-token cap before using text-only fallback. The full dry run with that fix also produced 18 listings, using mini/Luna/nano. Neither favorable rerun replaces the failed primary result.
- Row 298, Chefs' Harvest dining series: a separate full dry run produced 12 date-specific reservation listings with the official 17:00–21:30 hours, versus one saved recurrence with a 15:00 start. The source-backed page read is handled by the shared website detail enricher.

## Reproduction and limits

Raw row JSON, model/token usage, source review files, score CSV/JSON, and the combined score are under `artifacts/luna-oct2-cohort/`. UPEISU's unchanged repeat and higher-cap run are preserved in `stage3-swap-upeisu-repeat/` and `stage3-swap-upeisu-cap-fix/`. The workbook `outputs/01a0ea83-7031-7423-b853-966f2180d186/luna-oct2-stage3-swap-audit.xlsx` records all 88 primary rows and 370 saved/candidate listings. `npm run build` and the 31 relevant formatter and website detail tests passed. This is a local dry run; it is not evidence of a production deployment or Firestore writes.
