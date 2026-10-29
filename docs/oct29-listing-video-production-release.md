# Listing videos: Production release

Craig's October 29 phone screenshots identify iOS Production **1.1.20 (79)**, OTA `01a1801b`; the earlier two-clip release targeted Preview 1.1.10. Craig explicitly requested the Production port and a mockup. This receipt supersedes Preview as the active phone-test target.

Exact live Production source `875f6302d1ac28842e43cc09bd6fca051ca038a3` was recovered read-only from the earlier header task checkout after GitHub did not have the commit. Only the three reviewed video commits were applied in clean `C:/Windows/System32/GathR-Project/video-production`, branch `codex/listing-video-production-20261029`. Current Production fixes are preserved by ancestry; the video component/helper are byte-identical to reviewed Preview code. No Preview native/auth configuration was copied into the Production export.

Published source `a14cffe1a7e432ce1301afa7bd1506f8bca45f5f`; runtime **1.1.20**, iOS only; group `a7f701ad-64e5-48bb-a53d-c150afa98037`; update `01a18865-96db-7e0d-91d9-064c4e42ea58`. EAS view/list/channel independently verify the newest iOS Production update and unchanged full-traffic routing. Native fingerprint `6baab265658bbf45b6735e70da70e3a41bfabd41` matches the previous Production release; no new native build or App Store upload occurred.

Validation passed: TypeScript, seven video tests, lint with zero errors (222 repository warnings), exact Production profile with both social flags, real Firebase/App Check/native configs and the same live public Mapbox token. Video flag is enabled. Export: 2,547 modules, 112 EAS iOS assets. Rendered Android native component/player evidence was reused only after byte-for-byte implementation comparison; the generated screenshot mockup is illustrative. Physical iPhone adoption/playback remains unverified. Craig should reopen twice, check Profile OTA `01a18865`, and tap Watch video on Ben Kunder or Cowboy Christmas.

Production source plus postrelease documentation is pushed to the named feature branch. The verified incremental bundle `C:/Users/craig/Documents/Codex/2026-10-29/task/listing-video-production-candidate.bundle` requires the retained exact baseline `875f630`; its SHA256 is in the JSON receipt. Rollback group `4f6c7f70-8da6-4a35-82a2-47b52e5c2307` is preserved. No backend, event data, parser, gate, schedule, Android or Preview mutation occurred during this port. The separate full October 29 parse audit remains outstanding.

Detailed receipt: `oct29-listing-video-production-release.json`. Mockup: `C:/Users/craig/.codex/generated_images/01a0ea83-7031-7423-b853-966f2180d186/exec-9d1d5423-a78c-40c8-94ae-9370adc25ba0.png`.


Subsequent phone acceptance: Craig confirmed this original Watch video release works and supplied card/lightbox screenshots. The later authorized poster-first autoplay release supersedes it as the newest Production update; see `oct29-listing-video-autoplay-release.md` (OTA 01a188ba).
