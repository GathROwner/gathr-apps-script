# Equal-height four-band control on two photographed calendars

2026-10-02. These were local, paid Luna high dry runs through Stages 1–5.
The image-upload endpoint and managed URL were mocked. There were no real
uploads, Firestore writes, deployments, or production flag changes. Every
band came from the saved 2880×3840 Cloud Run-style color WebP; the full image
was cut at y=960, 1920, and 2880 with 280 pixels added on each side of an
interior cut (560 pixels shared by adjacent bands). No hand-placed
row boundaries or source-name hints were supplied. Four existing non-target
source-slot sentinels remained because the exact-post canary protocol requires
them; this was not a completely unguided production route.

| Fixture | Stage 3 | Final | Measured model cost | Source comparison |
| --- | ---: | ---: | ---: | --- |
| Factory February | 49 | 10 grouped records | $0.02228 | Recovered the February 3 `75¢ Wing Night` at 4 PM alongside Taco Tuesday. Initial reviewed-band Luna run omitted it. |
| Hunter May | 62 | 14 grouped records | $0.02866 | Again read `HEARTFAKERS` as `HEARTBREAKERS` on May 30, while correctly leaving that band listing untimed and keeping the adjacent food deal at 9 PM. |

Both dry-run finals kept the original managed source poster as the relevant
image; no analysis band became an event image. The May band title was rejected
downstream for its unprinted start time, so the misspelling did not become a
final event in this run. The test temporarily omitted source-name sentinels to
observe raw behavior; a production exact-post guard with the reviewed
`HeartFakers` spelling would now hold this canary for review.

The February full pipeline took about 4.8 minutes and May about 5.5 minutes.
An earlier repeat with manually placed bands also recovered February 3, so
this run does not isolate the equal-height geometry from model variation.
The generic crop is promising for coverage, but two trials do not justify
automatic routing of all dense flyers. The February final also shortened the
printed music-bingo name to `Music Bingo 28`, which needs source review. The
calendar year was supplied in the synthetic post text; these runs do not test
uncertain-year images or galleries with the calendar on a later slide.

Raw outputs: `artifacts/luna-six-calendars-2026-10-02/photo-06/luna-high-reviewed-equal-bands-r2.json`
and `artifacts/luna-six-calendars-2026-10-02/photo-04/luna-high-reviewed-equal-bands-r1.json`.
The dry-run harness supports `HELDOUT_AUTO_BANDS=true` and
`HELDOUT_PREVIEW_ONLY=true` for crop inspection before paid calls. Subsequent
runs use immutable labels, label-specific band image paths, and source/band
SHA-256 hashes so new comparisons do not overwrite old visual evidence.
