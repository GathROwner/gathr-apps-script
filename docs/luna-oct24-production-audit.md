# October24 production parse audit — complete, corrections proposed

## Conclusion and current boundary

The completed run has confirmed output defects. This is the consolidated bounded audit, **not** a release/apply receipt. No October24 code, deployment, repair, replay, scrape, model call or test suite was run by this audit. Automatic-resolution gates stay **OFF**. October22/23 applied packets were not replayed. The dirty main checkout is untouched.

Dataset **18bSvoYeRsGL6O04coO5jMsk7YCiyQMSo**, run **e8029a42-25de-4a8c-8039-a770f898c684**: completed **14:07:47.406UTC /11:07:47Halifax**,380/380 rows, elapsed **88min12.439sec** from12:39:34.967UTC. Completed processing lock, processed marker, final batch and both absent matching checkpoints are retained in completion.json. One row error does not invalidate proof that the run finished.

Fresh serving readback15:27:59UTC confirms all three parsers ACTIVE/latest100%, common source **1adfb0a7af75586451bafc064461dca7ebd00af2**, accepted commit **af5d804**. Revisions00512-wid/00476-zur/00468-xak; environment hash matches accepted baseline, both auto gates false and allowlist absent. Actual model/prompt/cache contracts were not changed. This is readback of the serving baseline, not a new deployment.

## Six bounded corrections recommended first

| Exact current path | Proposed recoverable action | Source-grounded reason |
| --- | --- | --- |
| venues/slug_exploresummerside/events/2keLVPPhiuAKJhG7TxIE | recoverable_withdrawal | Existing proper festival child at venues/2ei5OViB21wZRLJsXH1Z/events/oct14_repair_festival_20261031_13; Oct31 10:00–12:30. |
| venues/slug_exploresummerside/events/HEITPkLJY5IXxfdH3pWL | recoverable_withdrawal | Existing proper festival child at venues/slug_centrebellealliance/events/oct14_repair_festival_20261028_9; Oct28 17:00–20:00. |
| venues/slug_exploresummerside/events/Us7PRw49hcAglw5UQ6ak | recoverable_withdrawal | Fresh exact-date control venues/slug_centrebellealliance/events/oct14_repair_festival_20261024_6 is Oct24 18:30–20:30. |
| venues/slug_centralcoastalpei/events/sTy6hOqvqdwXmFMx1lN4 | recoverable_withdrawal | Source says Charlottetown collaboration until end October, with no event clock or Central Coastal attendee venue. Do not relocate to the distillery by inference. |
| venues/slug_harbourfronttheatre/events/rJGyg5P64BZhfzpUHmRt | remove_false_daily_recurrence | Source says tonight Oct23 at19:30. Preserve the dated occurrence; remove unsupported daily lifecycle so it does not repeat. |
| venues/slug_easternkingssportsplex/events/IxudtQq6NXuCm7npZ6LF | description_only_restore | Preserve Oct31 10:10–11:10 and its source/media. Remove U9 anomaly diagnostic text wrongly merged from the distinct 11:20 candidate; do not create/correct the ambiguous U9 clock. |

The three Explore Summerside records are confirmed wrong-publisher **duplicates**. Fresh keeper reads confirm correct venue/date/time and the festival parent. The first two were recreated at new IDs after yesterday's withdrawals. Yesterday explicitly deferred broader publisher-fallback prevention; this is not evidence a deployed publisher guard passed a test it was designed to handle. Wicked Spirits is a separate wrong-publisher/unsupported-session case; the poster names a Charlottetown festival collaboration, not the Cavendish publisher or a midnight session. It must not be guessed onto the distillery.

These are **six existing-record actions**, not an exact frozen write manifest. All originals are in target-events.json; future execution must freshly bind full typed originals, source siblings, proper festival controls, venues, feed version and parser-idle state, then create complete recoverable archives. No backup/apply helper has been prepared or approved for these new IDs. Do not reuse an older day's helper.

## Additional material findings and bounded followups

1. **Classic Movie Club at the wrong library:** venues/slug_peilibrary/events/OuGGCw6IVzwRUdN7zqGG. Original caption says Charlottetown Library Learning Centre, Rotary Auditorium,October26 at19:00. Current venue PEI Public Library Service is89 Red Head Road,Morell; its venue metadata explicitly records the separate CLLC split. Known correct CLLC venue is97 Queen Street,Charlottetown. Prepare a recoverable relocation after both existing source IDs/destination siblings are fenced.105-minute film runtime can be displayed in description; it does not promise an exact20:45 meeting end. Current23:00 is a default with end source none, not an advertised finish.
2. **Hooks & Needles weekly versus monthly:** venues/slug_stpaulschurchinpei/events/G4oIKY51PSPQtvVrcx3F. Source says last Friday monthly beginningOctober30,10:00–11:30. Extraction/validation/final all say none, but duplicate update preserves old weekly_friday. Inspect two older source controls, then prepare first-occurrence correction while preserving monthly prose. No general monthly engine is proposed here.
3. **Finite ice lifecycle inconsistency:** venues/slug_easternkingssportsplex/events/f3Nt5xLtPzcBG4VaSWTt. Enlarged poster prints all four SundaysNov29/Dec6/Dec13/Dec20 at19:40; Stage3 captured them. Formatter groups two pairs, merge extends horizon throughDec20 but retains totalOccurrences2. This is inconsistent metadata; future app materialization was not exercised, so no claim that two dates are definitely missing in the app. The13:50 Oct25 item also merged into an Oct11–25 legacy keeper; new poster does not support its inherited15:50 end. Historical evidence remains required.
4. **Printed clock/date conflicts:** rink U9 Saturday11:20–12:20AM is genuinely printed between daytime sessions. The incorrect merge affected U7 description, not U7 clocks. Hold U9, do not silently choose noon. Available Ice poster saysThursdayDecember30, which conflicts with2026 weekday; currentvenues/slug_easternkingssportsplex/events/swHHJ59kXGvpKz8nJV2l needs an exact hold/withdrawal plan, never a guessed date/year.
5. **One processing error / one omitted valid session:** row255,Soul Fit,source122283942794151845. Poster explicitly suppliesNovember21,09:30–10:30,Cymbria Lions Club,2184 Church Road,Rustico. Venue matcher chose **venues/WLgrwH7svmGT9rKcUxl8**, whose fresh canonical record has names/city but **no address or coordinates**. buildValidatedVenuePointFields correctly rejects the missing address. Error is “Venue publication requires canonical venue ID,name and address”; no event written. Separate venue completion and exact recovery need reviewed location proof; do not bypass validation or turn on automatic resolution. Future code may route this into a structured hold rather than an unhandled row error, subject to narrow implementation review.

## Source holds and healthy controls

- **Holland Drive:** actual poster supports every one of19 generated windows:Oct23–31 all-ages17–19,thrill19–21:30,Oct25 sensory15–17. Keep held because no exact property is established. Caption-only queue assessment did not inspect media; its absent-clock conclusion is superseded by this poster. A sibling contest listing43 Holland Drive does not prove a binding. Nineteen windows are not nineteen distinct venues.
- **Village Pottery/Playhouse/SweetSpot:** reuse the location owner's Oct24 section of firebase/artifacts/location-queue-leads-2026-10-21.md. Village activity10–11:30 is already past; Playhouse17–19:30 has conflicting city hint; SweetSpot's11:35 candidate is unsupported by available caption/gallery. Kays ground-beef imagery was unavailable in this audit; do not call its item hallucinated from a caption-only check.
- **Cornwall:** children poster actually saysBehind Westwood School(Meadowbank Road); later Haunted Woods saysHyde Park Trail. Preserve separate identities. Cornwall book launch29 Cornwall Road matches Civic Centre complex; Blank Canvas poster explicitly names Confederation Court Mall. Neither establishes a new geographic defect.
- **Pool/rink controls:** Bell Aliant six pool/slide/lane windows retained; family scores60 for recreational pool/slide and15 for lane. Consecutive distinct intervals remain separate. Enlarged Cavendish Farms weekend table matches25 formatted sessions. Closed/private slots are not blanket public activity proof.
- **SeaWalk/festival controls:** sourceOct25 Felt Art matches the exact recovered keeper rather than creating a new duplicate. Correct Pumpkin children and parent remain. Source-identical evidence reused for22 captions and26 image hashes. Actual pottery tilde-range source absent today, so no claim of next-run live effectiveness for that fix.
- **Other nonwrites:** untimed offers/activities remain hours holds, not necessarily invalid posts. WoHeLo09:00 at144 Dorchester appears in Stage3/4 but drops before final with no saved hold; it is past and no new venue/pin is proposed. March1 Two Pianos old poster/online link remains ambiguous; October24 source explicitly19:30 is valid but its nonwrite/duplicate attribution was not independently closed. Do not create another copy to make counters agree.

## Coverage and reconciliation

Read **165 actual post captions/shared captions**,164distinct source IDs,159snapshots plus6early geography exclusions;215raw placeholders account for the remainder of380rows. Stage1 artifacts show89pass/70reject. Reviewed all12 ordered contact sheets covering229unique available image hashes;234/257gallery references available,23unavailable. Enlarged material posters for exact source decisions; no full video/audio,28thumbnail references only. Unavailable errors were not repeatedly retried. Per-source inventory separates stored parser disposition from independent notes.

**247 final candidates**,140create operations+74update operations=214writes across206distinct canonical records. Six records created then updated;72distinctupdated, two extra update operations are not automatically replay defects. All206written canonical documents and exact detail endpoints read;all206HTTP200.28unknown candidates,3duplicate counters,1explicit online coverage hold leave **one nonwrite disposition not independently attributed**. No invented reconciliation or all-clear. No full-catalog/active-feed rescan duplicated the other audit owner.

## Recorded usage, timing and evidence limits

| Stage | Recorded calls | Input tokens | Output tokens | Cached input tokens | Cache write tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| stage1 | 167 | 1576374 | 123549 | 570609 | 7051 |
| stage2 | 113 | 888694 | 24007 | 143079 | 2578 |
| stage3 | 97 | 980854 | 157632 | 0 | 980563 |
| stage4 | 88 | 323953 | 66904 | 4352 | 0 |
| stage5 | 91 | 266986 | 80269 | 147343 | 14226 |

Total **556recorded calls /4489222tokens**.468calls GPT-6Luna,88GPT-5nano; no paid audit calls. These totals include batches/recovery and are not a retry count. Complete per-call latency/retry attribution and invoice dollars are **not audited**; total run elapsed is88min12.439sec. Stage4 count recovery for pool data and Stage5 batching are visible, but aggregate call excess cannot identify every retry. No price-table research was added.

Artifacts under functions/artifacts/luna-oct24-production-audit/: completion.json,serving-readback.json,source-first-review-inventory.json,media-manifest.json,contact-index.json,ledger.json,target-events.json,event-update-audits.json,write-reconciliation.json,api-target-details.json,focused-controls.json,failed-row-venue.json,usage-summary.json,proposed-next-small-batch.json,audit-completion.json. Workbook541097bytes is the original retained dataset, downloaded once; no new scrape.

**Next:** coordinator reviews this proposal and selects the exact small implementation/data slice. Prepare clean serving-baseline candidate and guarded backup/apply packet only for that selection. Reuse unchanged tests; run only necessary checks for genuinely changed code. Larger publisher routing,monthly/finite recurrence redesign,hours/Places,aliases/global-fence/metadata work remain deferred; all automatic-resolution gates stay OFF.
