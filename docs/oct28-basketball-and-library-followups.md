# October 28 basketball and seven library follow-ups

Direct user instruction `01a1848e-0795-7a40-836c-776131c784a6`: handle the basketball games first, then the seven library entries, showing original images when a decision remains unclear. This chat is the single executor. The serving parser remains commit `0e9403a` / common hash `ab2b62d80f7ede432b7b031603e27122d691a322`; automatic-resolution gates remain OFF.

## Basketball — complete

The original UPEISU gallery's basketball poster explicitly names Chi-Wan Young Sports Centre and Friday, October 30: women's game at 18:00 and men's game at 20:00. Neither finish is advertised. The [official UPEI facility page](https://www.upei.ca/ar/athletic-facilities/chi-wan-young-sports-centre) and a fresh exact Places result corroborate this independent venue. A complete 566-venue catalogue had no exact name/alias/place-ID match. Nearby campus coordinates do not establish the same venue as UPEISU or The Fox & Crow.

One six-write transaction committed at **2026-10-28T22:18:35.487723Z**, feed **493 → 494**:

- Create `venues/place_42ea0444650c1153` for Chi-Wan Young Sports Centre, Place ID `ChIJlbKW1bRSXksRQvIEf68YSj0`.
- Create women's game `venues/place_42ea0444650c1153/events/oct28_recovery_31f92de31723624c2520`, October 30 at 18:00, unknown finish.
- Create men's game `venues/place_42ea0444650c1153/events/oct28_recovery_a5fb40df727f5958d317`, October 30 at 20:00, unknown finish.
- Resolve the exact manual queue `unrecognized_venues/uv_67fdbcef90c2d8a958449512` to the new venue using its established `created_new` schema. Its finalization records no row replay, shared-event resume or Drive append.
- Create one full native typed archive and increment the feed.

The original two-image gallery is preserved. The basketball poster (gallery index 1) is primary across image and provenance fields; the formatter's default Paint the Pride image was not used as the game cover. Paint the Pride's October 29 17:00–19:00 record remains unchanged.

Helper commit `20f3026`, `firebase/recover-oct28-basketball.cjs`. Thirteen focused offline controls, an actual read-only transaction and fresh outside/inside parser-idle checks passed. Exact native afterstates, all six write versions, source/queue/archive and feed reconcile. Both public details, all seven complete active-feed pages, exact two-event canonical venue membership and both source images pass. The captured feed adds exactly two games, retains 674 rows unchanged and filters two old rows whose existing 19:00 ends passed between captures. Those are filtering changes, not deletions. Fox & Crow is protected by the complete venue-catalogue projection and its update version, not a separate full native guard entry.

Completion, full typed backup, source/Places captures and actual commit: `functions/artifacts/oct28-repairs/basketball/`. Independent postapply SHA256: `c5d988be60526d5d4e937ef2a363c558fa0732eaf9fd5db65e1b46b73803fc03`. Root rechecked its 25 evidence hashes. `AUTHORITY_CLOSED.json` supersedes the immutable, hash-bound as-at-apply authority; the attempt and commit markers prevent another apply.

## Library drop-ins — three recovered

The source explicitly says both “during open hours” and “drop in” for these dated activities. Their clock ranges are therefore reviewed availability windows. Each title visibly says **Drop-in** and each description explains that visitors can arrive throughout the window. Start and end provenance remain **implied**, derived from published library hours; they are not represented as clocks printed on the activity poster.

| Activity | Date | Availability | Clock evidence |
|---|---|---|---|
| Kinkora: Build & Play! (PD Day) | November 27 | 10:00–14:30 | [Official Kinkora Friday hours](https://www.princeedwardisland.ca/en/point-interest/kinkora-public-library), matching the existing venue cache |
| Hunter River: Dinovember Activities (PD Day) | November 6 | 13:00–17:00 | [Official Hunter River Friday hours](https://www.princeedwardisland.ca/en/point-interest/hunter-river-memorial-library), independently matching fresh Places details |
| Hunter River: Scratch Art Bookmarks (PD Day) | November 27 | 13:00–17:00 | Same exact source and verified Friday hours |

All three have scoped child/family evidence and badges (scores 100/70/70). Original source snapshots and their no-fixed-clock constraints remain unchanged. Only these manually reviewed copies use the derived windows. The global date-only switch and general no-clock protections are unchanged.

Hunter River's cached hours were stale. The current official page and fresh Places record agree on Tuesday 16:00–20:00, Wednesday 10:00–14:00, Friday 13:00–17:00 and Saturday 10:00–15:00; other days are closed. Only `operatingHours` and `operatingHoursUpdatedAt` were updated on its existing venue. Regular hours support the advertised drop-in windows; no claim of immunity from later date-specific closures is made.

One six-write transaction committed at **2026-10-28T22:35:52.768746Z**, feed **494 → 495**: three create-only events, the two-field venue-hours update, one full native typed archive and one feed increment. Event paths:

- `venues/slug_kinkorapubliclibrary/events/oct28_recovery_0476b5b4729f766d8942`
- `venues/slug_hunterrivermemoriallibrary/events/oct28_recovery_6be61ae7d455ac8304e7`
- `venues/slug_hunterrivermemoriallibrary/events/oct28_recovery_ceb2263b09e66ca882b6`

Helper commit `b53dd8c`, `firebase/recover-oct28-library-dropins.cjs`. Fourteen focused offline controls and the actual read-only transaction passed. An initial read-only transport failure changed no production data; the read-only retry passed before apply. Native source/venue/target/query/backup checks, three public details, all seven active-feed pages and all five original gallery images pass. The captured feed adds exactly three records, retains 675 rows unchanged and filters one existing Zumba occurrence after its stored 19:30 end. No existing programme row was retimed.

Completion, full typed backup and actual receipt: `functions/artifacts/oct28-repairs/library-holds/`. Independent postapply SHA256: `dc47233489602105e7f758de4c62a1a5b635e7c8b33cc08dce7eb7fe03f72569`. Root rechecked its 29 evidence hashes. Apply authority is consumed and closed in a separate closure record, preserving the immutable as-at-apply evidence.

## Four other library entries

Two appointment services stay excluded: Stratford Tech Time has no fixed date/start, and Seniors Navigator on November 3 requires an individually arranged appointment with no published time. They are not treated as scheduled group activities.

Two contradictory dates remain unpublished, but **official event pages now resolve both conflicts**. Craig suggested checking the web after finding Kinkora's calendar listing. Fresh direct reads of the matching official PEI Library event pages supersede the earlier pending date-choice questions; no guessed human date choice is needed. These are verified source decisions, not completed live recoveries.

| Activity | Printed source | Official matching event page |
|---|---|---|
| Kinkora PD Day: Dinovember Story & Craft | Friday, November 7, 10:30 | [Official event 4083184](https://peilibrary.libcal.com/event/4083184): Friday November 6, 2026, 10:30–11:00 Atlantic, Kinkora Public Library; exact title, description and family audience match. The explicit finish is new corroborating evidence. |
| Stratford Service Canada Information Session | Tuesday, November 18, 13:30–15:30 | [Official event 4085345](https://peilibrary.libcal.com/event/4085345): Wednesday November 18, 2026, 13:30–15:30 Atlantic, Stratford Public Library; exact title and David/Service Canada description match. |

The current official pages disagree with the posters. Their historical edit timing was not established, so this does not prove when a correction was made. Both original posters remain preserved. Captured official pages and retrieval time: `functions/artifacts/oct28-repairs/library-holds/OFFICIAL_DATE_CONFLICT_VERIFICATION.json`.

Recommended future handling: only when source fields conflict, perform a bounded targeted search, then read a matching official organizer/venue event page. Verify activity, venue and edition/year; retain both conflicting evidence and the corroborating URL, capture and rationale. Search summaries and third-party copies alone cannot resolve the conflict. If official evidence remains ambiguous or disagrees, retain the hold. This is a proposed exception workflow, not implemented parser behavior; automatic-resolution gates remain OFF.

No further venue creation, queue write, storage upload, parser call/replay/deployment, schedule/traffic/gate change, app release or map interaction occurred. Verification is native/API and saved-source evidence; phone cache adoption was not tested. Automatic future handling of these explicit drop-in patterns is not certified by this manual recovery.
