# October 2 large-parse Luna cohort comparison

> Follow-up: this first comparison used a guarded route with older-model retries. The [Luna-only audit](luna-oct2-extended-comparison.md) adds 40 distinct posts and reruns the fallback posts without retry. Its release assessment supersedes the guarded-only decision below.

## Scope and method

The completed October 2 dataset `1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq` had 384 source rows and 175 original parse snapshots. Of those snapshots, 152 had one to four source images. This evaluation selected 40 of those rows by a fixed SHA-256 rank, excluding the eight rows with the most saved output, then added those eight dense rows. The 48 selected rows represent 31.6% of the eligible image rows. This is a broad sample, not a claim of statistical representativeness across all post types.

The dry run reused each row's saved caption and ordered source gallery, reproduced the Cloud Run Sharp preprocessing, then called `parsePostData` with the exact-post Luna high canary. Source uploads were mocked; no event-writing function was called. One row's original images and exact managed-gallery recovery were unavailable. The local upload mock initially rejected repeat uploads from fallback/retry passes. Six affected rows were rerun with a corrected mock that serves repeated gallery uploads. The remaining first-pass fallback rows should be treated as route/quality evidence with this harness limitation.

The saved production parser output is the baseline. Event counts are *listings produced by `parsePostData`*, not unique occurrences after Firestore expansion and deduplication. The automated title/date/time matcher is an audit aid; it is not ground truth. In particular, it flags corrected dates and consolidated duplicate listings as misses.

## Outcome

| Measure | Saved production output | Candidate route |
|---|---:|---:|
| Rows with accessible images | 47 | 47 |
| Rows producing at least one listing | 23 | 23 |
| Listings on those 47 rows | 162 | 173 |
| Luna-only rows | — | 20 |
| Rows using the legacy safety fallback | — | 27 |
| Dense eight rows, listings | 138 | 135 |

The six corrected-mock reruns changed two of the first-pass candidate results: row 90 went from two duplicate maze listings to one, and row 195 went from two separate pricing-option listings to one pumpkin-picking event. Replacing those two first-pass outputs yields 171 candidate listings, still above the saved 162. The other four rerun counts did not change. Three no-event rows still used the fallback, while one positive market row still used it. The reruns demonstrate both harness sensitivity and model/route variation; **173 is not a guaranteed production count**.

All eight dense rows stayed on Luna, with no fallback. The saved output had 138 listings and Luna had 135. Exact date/start/title matching found 123 pairs. Source review shows that some numerical differences are improvements rather than missed events:

- Downtown Charlottetown row 34: 42 of 43 saved listings; one real missed `Got Blues Matinee` at 1 pm Saturday, while `Dino & Judy` at the same time was retained. The first automated matcher misidentified the missing title because both events share a start slot; the matcher was fixed to match title pairs first.
- Row 36: all 28 saved listings matched.
- UPEISU row 209: 18 versus 15. The three-image source confirms additional `Share the Pride`, `Monster High Drag Show`, `Mix & Mingle`, and `Halloween Pub` entries. The saved output alone included online election voting start, which the candidate omitted. The source supports the four added event entries.
- Bell Aliant Centre row 97: 8 versus 14. The candidate retained the four lane-swim sessions, Friday Fun Swim, and three fitness classes. The six omitted saved listings are a pool closure and amenity/open-hour statements, rather than distinct activities.
- Albert & Crown row 21: 15 versus 13. The calendar source confirms Joey Doucette on October 15 and 29, both omitted by the saved output. The candidate moved the four food-special start times from the posted 11:30 opening to 11:45; that shift needs correction or confirmation.
- Beaconsfield row 349: both produced 12. The saved output repeated November 10 and 13 while omitting October 30 and November 6; Luna produced the missing dates rather than the repeats.
- Row 85: all nine saved listings matched.
- Row 66: 3 versus 4. The candidate omitted an administrative registration item and shortened two very long inferred end times; source timing still deserves review.

Representative-row review also found meaningful gains and two defects:

- Montague Curling row 308: the saved output had four junior sessions on incorrect October dates. The source advertises October registration and November program starts; the candidate separated two registration sessions and four November junior groups.
- Stratford row 333: the saved output had zero; the candidate produced three source-supported recurring class programs.
- Island Hill Farm row 337: the candidate found the weekend market schedule and Halloween event, but also turned a Sunday admission offer into a `Food Special` with an invented 20:04 start from the post timestamp. The offer needs proper category and timing or suppression.
- The Club row 302: the caption says “Ian on the mic at 4!” without AM/PM. Luna's extraction marked the time unknown, but final formatting produced 04:00; the saved output inferred 16:00. This is a downstream time-resolution defect exposed by the candidate.
- PEI Marathon row 319: the saved output produced separate October 17 and 18 listings from a sponsor spotlight announcing an October 16–18 weekend. The candidate produced one umbrella listing dated October 16. Neither result establishes the specific race schedule.

## Cost and safety

The 48 candidate dry runs made 163 Luna calls, 38 GPT-5 mini calls, 15 GPT-5 nano calls, and 20 GPT-5.2 calls, including fallback/retry work. At October 2 published standard API list prices, charging every input token as uncached, their combined upper estimate is **US$0.445**. The eight dense Luna-only rows account for **US$0.100** of that. The saved production snapshots lack complete per-call token usage, so this test does **not** establish an exact same-row savings ratio. Actual billing may be lower because many input tokens were cached. Cloud/storage and other vendor costs are excluded.

No parser event write was invoked. The dry-run flag suppresses venue-hours cache writes; a read-only Firestore check found zero `venues.operatingHoursUpdatedAt` updates since 21:20 UTC during the corrected replay. The scheduled production route was not changed by this evaluation.

## Decision

The candidate passes the user's broad coverage screen: the same 23 posts produced listings, and the candidate yielded more listings overall while source review found several cases where it recovered events or dates the saved parser missed. It is a **release candidate for a guarded rollout**, not a claim of parity on every field. Keep the existing safety fallback and monitor exact-post outcomes. Before broadening to every post, address the ambiguous 04:00 time and the admission-offer timestamp/category, and retain the source-backed missed-matinee case in the regression set. A final selected-row dry-write payload check and rollback-ready configuration review remain release steps.

Per-row counts, model usage, cost estimates, and matcher flags are in [`score.csv`](../artifacts/luna-oct2-cohort/corrected/score.csv). The original source-gallery identity and selection are in [`manifest.json`](../artifacts/luna-oct2-cohort/corrected/manifest.json). Raw row outputs remain in the local artifact directory for inspection.
