# October 10 complete Stage 5 Luna-none evaluation

## Coverage and method

Dataset `1a8FFxUSkseWH6poV4-Htdhv4BRUSNlZl` has exactly 69 source posts
with actual Stage 5 calls. All 69, with 221 supplied Stage 4 items, are present
in the frozen replay cohort. There are no missing or unrelated rows.

The first full replay used production formatting with Luna none, nine-item
batches and concurrency two. The second independently called Luna for every
post again, with the production global effort still set to medium and the
explicit per-call override set to none. All 79 second-pass requests actually
used Luna none and reported zero reasoning tokens. The harness blocks all
network endpoints except OpenAI Responses; neither run can write events.

Source hashes match the frozen cases. Verification checks title/date/time
identities, occurrence multiplicity after bounded recurrence expansion,
supplied venues, prices (including nested pricing), ticket links and image
indices. It also checks for unexpected occurrences and invented clocks.
This is a Stage 5 counterfactual, not a rerun of Stages 1–4 or live writes.

## Results

| Measure | Production Nano medium | First full Luna-none replay | Fresh production-override replay |
|---|---:|---:|---:|
| Source posts | 69 | 69 | 69 |
| Supplied items retained | — | 221/221 | 221/221 |
| Sum of per-post Stage 5 elapsed time | 34.26 min | 8.69 min | 7.34 min |
| Recorded token cost, estimated USD | $0.184466 | $0.055290 | $0.054156 |
| API calls | 81 | 81 | 79 |
| Missing/extra supplied occurrences | — | 0 | 0 |
| Unrecovered response failures | — | 0 | 0 |

The fresh repeat uses 78.6% less aggregate Stage 5 time and 70.6% less token
cost than today's production Stage 5. These are production-versus-local replay
measurements with the same frozen inputs and the current hardened formatter;
they are not a guarantee of tomorrow's total run time. The earlier five-source
matched Nano/Luna comparison under the same formatter measured 74.1% less
time and 62.4% less cost, independently supporting the model improvement.

204 output objects represent all 221 supplied occurrences: the formatter
consolidates 18 printed painting-class dates into three bounded weekly parents
and three slide dates into one bounded daily parent. Exact date/time inventory
and multiplicity are preserved. The only supplied price wording change is
`$1.49` to `$1.49 per loaf`, supported by the bread offer.

The first replay had one malformed JSON response for row 359; two bounded
two-item retries recovered all four events. The fresh repeat had no malformed
or incomplete responses. Successful recovery is distinguished from flawless
raw model responses.

## Category review and safeguard

The broader category comparison found six Bell Aliant public pool/lane-swim/
waterslide sessions labeled Gatherings & Parties instead of Sports. Their
dates, times, venue and identities were intact. A narrow activity-title rule
now preserves Sports for public aquatic access. Pool parties, swimming lessons
and billiards controls retain their own categories.

All 69 saved raw second-pass responses were then played through the updated
production formatter locally. Prompt hashes were required to match; no API
calls were made for this playback. All 221 supplied occurrences still survive,
with no unexpected occurrences or multiplicity changes, and the six aquatic
sessions now have Sports category. Local playback time is not an API speed
measurement and copied response usage is not additional paid cost.

Other broad category choices can differ without changing event inventory:
Tango Night is Gatherings & Parties rather than Live Music, the sparse variety
show is Comedy rather than Live Music, and Gin & Tonic is Live Music rather
than Gatherings & Parties. These are distinct from a lost event or wrong date.
The existing cinema-admission fix also correctly changes three food-special
classifications to Cinema. Do not claim every output field is byte-identical.

## Recommendation and release boundary

Recommend **100% Stage 5 Luna none for the next regular parse**, retaining
Stage 2 at 50%, Stages 1/3 at 100% Luna high, and Stage 4 Nano low. Preserve
bounded retries and source-identity/completeness holds. No additional Nano
model fallback is needed by these results. The code build and all **584
compiled backend tests** pass, including the aquatic regression and controls.

At this evaluation's completion, production remains at the previously verified
50% Stage 5 setting. Craig's latest message requested this full test and
proposed 100% as a possibility; the rollout choice has been requested before
changing production. The aquatic safeguard is tested locally and has not yet
been deployed. A release still requires a fresh inactive-parser preflight,
narrow dry run, three-function deployment and live environment readback.

The Stage 3 calendar inventory/title omissions and existing live-record repairs
remain tracked in `luna-oct10-production-audit.md`; Stage 5's complete replay
does not resolve defects already present in its input or prove future datasets
cannot fail.

Evidence: `artifacts/luna-oct10-production-audit/stage5-100pct-*.json`.
Raw responses, frozen cases, network-blocking harness, playback and full test
output are retained privately at `C:\Users\craig\.codex\luna-oct10-audit`.
