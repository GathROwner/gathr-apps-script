# Video pipeline: initial offline findings, October 29

Scope: saved October 28 acquisition/snapshot evidence and accepted serving source commit `4a803f5df2078dbc66c046bd91eb85f49cb8cf68`. No fresh scrape, paid model call, replay, live parser change or full-run re-audit.

## Confirmed example

PonyBoat Social Club post `1119028204045061`, saved row 329, advertises Halloween drinks and treat bags Friday and Saturday. The scraper retained an 11.701-second video attachment with HD/SD playback URL fields and thumbnail fields. The original clip and its audio were not watched/listened to in this investigation; retained links do not prove current availability.

Snapshot `parse_snapshots/1RIa4YTgueN-q5TfBXN26pk3twDVx3itf_329_1793195659254` records two input image URLs. Both match the scraper's image/thumbnail fields and share the same image asset path with differing query parameters. They are thumbnail variants, not two sampled moments from the clip. The frame manifest marks each as a whole image, and `stage3InputKind` is `image`. Stage 1 describes a hand holding an iced drink, with no visible text or event details, for both images.

## Code path

In the accepted source, `src/services/driveService.ts:852` (`collectMediaUrls`) collects still-image and thumbnail fields, not the video delivery fields. `src/processing/rowProcessor.ts:3279` passes normalized image URLs, captions and shared thumbnails into the full parser. The classifier, extractor and validator construct image/text AI inputs. There is no clip decoding, temporal video sampling or audio transcription in this inspected regular full-parser path.

Therefore playback in the app does not establish that the parser watched the clip. Details visible later in the clip or spoken in its audio can be absent from parser evidence. This is an architectural coverage limit, not proof that any particular event detail was missed.

## Evidence and next question

Saved evidence base: `C:/Users/craig/Documents/Codex/2026-10-28/task/`.

- `input-rows.json` SHA256: `d2dc401d2217a76d7d74ae54996906c6c45cba671e6447a2fa337734ba8f4abf`.
- `snapshots.json` SHA256: `fbc2f79a58a9de83ac42c75309fd6e71b0bd7998581650832030dd512f156630`.

The next useful comparison is a small set of original clips versus their saved captions/thumbnails: identify additional attendee-relevant dates, clocks, venues, prices or restrictions before recommending any new processing. No assessment of full-clip accuracy, audio coverage, incremental cost or savings has yet been made. No new video-processing behavior is enabled.
