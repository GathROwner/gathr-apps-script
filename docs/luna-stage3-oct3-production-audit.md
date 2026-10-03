# October 3 Luna Stage 3 production audit

## Run and scope

- Regular full dataset: `1n2r2IxIoo_EGe406uZjYcHTKmsCjV4vA`, completed October 3 at 15:21:46 UTC. The processed-dataset record, final batch state, processing lock, and absence of a checkpoint confirmed completion; dry runs and selected-row replays were excluded.
- 367 raw rows, 336 processed rows, 65 processed posts, 99 skipped, 203 invalid, 9 duplicates, no runtime errors. The run wrote 91 new events and 45 updates overall.
- The 17% deterministic sample selected 26 post IDs. Twelve actually reached GPT-6 Luna high Stage 3 (17 Luna calls); one selected post was held before Stage 3 by a gallery frame mismatch; the rest were rejected or routed before Luna. Nine of the twelve Luna posts wrote 13 event documents. This is a small, uneven sample, not a recall estimate.
- For these selected rows, logs and snapshots show GPT-5 mini in Stages 1–2, GPT-6 Luna high in Stage 3, and GPT-5 nano in Stages 4–5. No GPT-5.2 fallback appeared. Snapshot usage totals for the selected post records: mini 28 calls, 168,901 input and 29,017 output tokens; Luna 17 calls, 101,842 input and 13,598 output tokens; nano 22 calls, 55,828 input and 43,787 output tokens. These are token counts, not a full-run bill.

The local source and production evidence are in `artifacts/luna-oct3-canary-audit/production-snapshot-ledger.json`, `actual-write-ledger.json`, and `pre-repair-firestore-backup.json`. Original ordered gallery images were inspected in `C:\Users\craig\.codex\visualizations\2026\09\29\01a0ea83-7031-7423-b853-966f2180d186\luna-live-source-review`.

## Source-to-write review

| Row | Post | Production result | Source-grounded finding |
| --- | --- | --- | --- |
| 44 | Lighthouse Willy's lobster mac | 1 write, Oct 2 only | Caption says the last two days of the season, implying Oct 2–3. Oct 3 availability is omitted. A local two-item prompt replay reached Stage 4, but Stage 5.6 correctly rejected the Oct 3 item for absent hours. No invented hours were released. |
| 55 | Spicey Chef 15% online orders | 1 write, Oct 2 | Discount and $20 minimum match the source. “Limited time” gives no end date; duration is uncertain. |
| 58 | Toby's Thanksgiving veggie box | 1 write, Oct 8–12 | The source says pre-order now and pickup Oct 8–12, without a specific ordering deadline. The saved date range describes pickup availability; its listing semantics remain ambiguous. |
| 150 | Seaside walk-in flu clinic | 1 write, Oct 2 1–4 p.m. | Correct source date and time. |
| 165 | Slaymaker cannoli | No write | The post has no explicit price, savings, or event time. Correctly excluded by current policy. |
| 166 | CBA PEI half-day CLE | 3 writes, Oct 20 | The three sessions were captured, but all were filed under the organizer's 119 Kent St venue rather than the printed Delta Prince Edward. Session 3 was saved as 11:30 p.m. Oct 20–12:30 p.m. Oct 21 even though the advertised program ends at 12:30 p.m. The source itself has a session meridiem typo. |
| 192 | Holman's warm apple crisp | 1 write, Oct 8 weekly | Wrong offer window and recurrence. Pre-orders close Oct 7 at 9 a.m.; Oct 8–10 are pickup days. Craig chose an order-window listing with pickup details in the description. |
| 208 | Milton Community Hall | 3 writes | Documentary and two Tuesday yoga slots were captured. The Saturday Oct 3, 10:30 a.m. Car Rally was omitted. The linked municipal article confirms the rally time and both yoga times; “No classes Oct 6” refers to a separate square-dancing paragraph, not yoga. |
| 221 | Kool Breeze tree sale | No write | Images promote a retail tree/shrub discount. Whether general retail sales belong in GathR remains a product-policy question. |
| 228 | Jordan Musycsyn at The Club | 1 write | Date and 4 p.m. start match. Live title says “Jordan Mocsyn”; the photo says “Jordan Musycsyn.” The end time is inferred. A stronger Luna name prompt still misspelled the surname on replay, so this remains unresolved generically. |
| 236 | Potato Museum Friday meal | No write | Source has a Friday meal, but no stated price or discount. Stage 4 applied the current priced-food-special policy. |
| 291 | Thane Dunn Elvis show | 1 write, Oct 24 7 p.m. | Correct title, date, start, Sobey Family Theatre venue, and source image. |

Selected row 293 was **not a Luna extraction**: three Facebook CDN sizes of the same “ON STAGE” card remained in the source list while the display gallery collapsed to one frame, so the canary source-frame guard held it before Stage 3. A local experiment that bypassed the identity guard did not produce reliable final times and was reverted. It has no production write from this run.

The exact 13 production document paths, saved fields, and image URLs are in `actual-write-ledger.json`. The independent Firestore query matched all 13 saved documents to the nine positive Luna posts.

## Local hardening and validation

- Luna-only prompt wording now asks for printed performer-name spelling and for savings pre-orders to use their order window. The spelling prompt improved the Jordan name but did not fully correct it; no automatic name overwrite rule was added.
- A bounded pre-order reconciliation after nano formatting protects a stated deadline from being converted to pickup-day recurrence. The Holman's exact-post dry run ended with one finite Food Special from the October 2 post time to October 7 at 9 a.m.; pickup stayed in the description. See `row-192-final-dryrun.json`.
- Luna-only linked-article parsing matches a dated paragraph to the item with the same date and at least two title tokens, and matches two times in a weekday class paragraph to two same-day class items. The Milton exact-post dry run produced documentary, Car Rally at Oct 3 10:30 a.m. with unknown end, and yoga at Oct 6 8:30 and 10 a.m. See `row-208-verified-dryrun.json`. No end time was invented for the rally.
- A half-day session guard reconciles the CBA source typo inside its printed 8:30 a.m.–12:30 p.m. program. A venue-address guard stops an organizer's row address from overriding a different printed event venue. The CBA exact-post dry run showed all three correct session times and the printed Delta venue, but the dry write held all three because a safe venue match was unavailable. The existing `venues/slug_thecorkandcast` record has a Delta name/address paired with The Cork and Cast ID/Facebook identity; it must not be aliased or used as the Delta without separate venue-record repair.
- The Oct 3 gallery mismatch was investigated but not changed. The older and still-serving route remains protected by the existing source identity hold.

`npm run build` passed. The focused compiled suites for datetime, linked-page enrichment, and venue matching passed 42/42. The full compiled backend suite ran 490 tests, with 488 passing and two failing in old shared-route fixtures dated September 1 and 5. Those test files and the shared-event parser were untouched; the failures are consistent with their dates being past on October 3, but no baseline rerun has yet proved that attribution. No production deploy or Firestore mutation has occurred as part of this audit.

The narrow three-function Firebase deploy dry run passed on retry after one transient Cloud Resource Manager request failure. A guarded repair script, `firebase/repair-luna-oct3-two-events.js`, passed its default dry run against the exact Holman and Jordan records: each source ID has exactly one current sibling, and both documents still match strict field fingerprints. It requires a separate `--apply` invocation, writes a fresh full-document backup, uses Firestore update-time preconditions in one batch, and verifies the two postconditions. It has **not** been applied. A read-only lock check found zero `processing`, `active`, or `paused` parser locks immediately before this preflight.

## Release and data decisions

The local fixes improve two confirmed omissions/incorrect windows and prevent the CBA organizer address from silently winning. They do not justify expanding the Luna sample. Before any production data repair, reconcile the mixed Delta venue identity and the exact three CBA event targets. Holman's live weekly record and Jordan's title are separately identified for guarded corrections; the Oct 3 Car Rally has already passed. Keep the canary sample at 17% until the repaired parser has a complete new full-run audit. The six supplied calendar photos and the GathR map are outside this release decision.
