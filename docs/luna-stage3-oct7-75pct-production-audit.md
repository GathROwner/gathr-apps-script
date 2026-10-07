# October 7 full parse: Luna Stage 3 at 75% allocation

## Completion and routing

Regular dataset `1eREpzt2nL6mpIX9St-GoKOvTDrdX4WwU`, run `c5614424-e270-4af6-9e34-8eb3d58afaf7`, completed October 7 at 15:56:35 UTC. The final checkpoint was 377/377; the lock and final batch were complete, `processed_datasets` existed, the checkpoint was removed, and there were no runtime errors. This excludes selected-row replays and dry runs.

The run processed 53 source posts and skipped 105; 219 rows were invalid and two were duplicate rows. It created 88 events and updated 44. The eligible image-post denominator was 86 and 71 were selected (82.6% realized from the configured 75% stable sample). Two selected Downtown rows used an anchored-text Stage 3 path, leaving 69 posts with actual Luna calls. There were 105 Luna Stage 3 calls and one OCR-debug call. Selected posts used GPT-6 Luna high in Stage 3 without GPT-5.2 fallback; Stages 1–2 used GPT-5 mini and Stages 4–5 GPT-5 nano. Unselected Stage 3 posts used GPT-5.2.

Source captions and ordered galleries were reviewed for the selected posts. The saved ledger, model logs, writes, and gallery evidence are in `functions/artifacts/luna-oct7-full-audit/`. Of 98 source image URLs reviewed, ten expired Facebook image URLs could not be fetched independently after the run. In particular, the Tignish Co-op sale image could not be independently checked; that is an audit limit, not proof of a correct omission.

## Findings and focused replay

| Source row | Production finding | Repair and focused result |
| --- | --- | --- |
| 9, UPEI Fall Open House | Luna emitted valid JSON with the October 24 event and URL, but the JSON repair path stripped `//` from `https://` and produced `stage3_no_items`. | Parse intact JSON first and handle comments outside quoted strings. Replay recovered the event. The official current page has no public time; a historical HTML comment wrongly lent it a clock, so website comment stripping and title identity were tightened. The second replay held the untimed event, with no invented time or write. |
| 60, Sport PEI virtual courses | The same JSON URL bug lost Luna's five online coaching sessions. | Replay recovered five dated sessions in four bounded records with registration URLs. The final write still holds because the venue resolver does not resolve `Virtual` as a physical venue. This is a downstream online-event gap. |
| 244, Eastern Kings ice | Luna's primary extraction found six source slots. The OCR supplement misread a date separator as a 10:00–10:10 slot. | Strip the printed date before clock-range matching and merge a generic OCR duplicate into its primary slot. Replay produced four finite parent records covering the six correct starts, with no false 10:00 slot. |
| 75–76, Clam Diggers | Luna extracted the two Thanksgiving dinner specials. A Monday closure in the same post caused final formatting to drop the weekend dinners. | Recognize an explicit dinner-special cue before applying the closure filter. Replay reaches the time gate, which still holds because the post omits hours. The first-party venue hours are a separate downstream resolution task. |
| 238, 239, 249, 251, 291, 325 | An online giveaway, ordinary restock, non-food sale, election filing, pumpkin stock, and floral product pickup were saved as event/special listings. | A source-corroborated final filter drops those transactions and notices while preserving real food deals, bookable activities, workshops, and gatherings. Row 238 replay now yields no payload. |

Eight exact false production records were backed up in `functions/artifacts/luna-oct7-full-audit/live-cleanup-manifest-2026-10-07T17-20-01-983Z.json` and deleted after Craig's approval, with update-time guards. All eight are absent in Firestore and their detail endpoints return HTTP 404. The correct Eastern Kings October 18 ice slot `BTl9t3Rd8KSEdrn4y8ND` returns HTTP 200. No source or venue media were deleted.

## Decision boundary

The reviewed defects do not show a material Luna-only date, venue, gallery, or source-identity regression after the focused parser/OCR repairs. A 100% setting means every eligible image post passing Stage 2 is routed to Luna Stage 3; text-only or anchored-text paths do not gain an unnecessary vision call. The current Downtown exclusion must be cleared for a genuine all-eligible rollout. The remaining Sport PEI virtual venue hold, Clam Diggers time hold, and expired image URLs are recorded limitations. Stage 4/5 latency is a separate investigation after this Stage 3 release.
