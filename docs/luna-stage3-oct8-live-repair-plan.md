# October 8 Luna live event repair plan

The parser prevention fixes are live in all three functions on source hash
`6ec1fb03acc847610ed2dd5f3ef8ae2cf4e42b10`. These are the existing
records requiring a guarded data repair. No live event or media record has been
changed by the four dry runs below.

## Exact proposed mutations

1. **Eligibility cleanup:** delete exactly 11 false listings and change the
   Tignish $0.99 grocery deal from `weekly_thursday` to a one-off on October 8.
   Exact paths, fingerprints, same-source siblings, and the complete backup are
   in `functions/artifacts/luna-oct8-full-audit/live-cleanup-plan-2026-10-08T18-57-36-933Z.json`
   and its referenced backup. The script is
   `firebase/repair-luna-oct8-event-inventory.mjs`. It preserves the three
   advertised Tipsy Farmers specials and the nine Bell Aliant public activities.
2. **Cavendish Farms PowerSkating:** atomically replace the two open weekly
   parents (`venues/LglliE42SPFssmoU01su/events/N1zwOCv81EGSbomyQZlC` and
   `venues/LglliE42SPFssmoU01su/events/vnYpnIqiI9jmHmqee19m`) with exactly
   20 one-off documents at the paths listed in
   `functions/artifacts/luna-oct8-full-audit/powerskate-plan-2026-10-08T19-00-50-553Z.json`.
   Ten Saturdays and ten Sundays match the printed flyer; November 7 and 8
   are absent. The script is `firebase/repair-luna-oct8-powerskating.mjs`.
3. **Hunter's Ale House:** create only Friday October 9 Griff & Guest at 10 p.m.
   and Saturday October 10 Gin N Tonic at 10 p.m. The exact proposed paths are
   `venues/fb_100064116963888/events/hunters-griff-guest-2026-10-09` and
   `venues/fb_100064116963888/events/hunters-gin-n-tonic-2026-10-10`.
   `functions/artifacts/luna-oct8-full-audit/hunter-plan-2026-10-08T19-05-04-027Z.json`
   contains fingerprints and a full template backup. The same-source Sunday
   event remains. An October 8 Downtown Charlottetown roundup separately
   names Laura and Don for Friday at 11 p.m.; this plan leaves that listing
   untouched because the two sources conflict rather than proving a duplicate.
   The venue's October 7 flyer explicitly names Griff & Guest at 10 p.m.
4. **Trailside Music Hall:** create the October 8 8 p.m. Fucked Up/Club Rat
   show at exact path
   `venues/slug_trailsidemusichall/events/trailside-fucked-up-club-rat-2026-10-08`,
   with `https://www.trailside.ca` as its ticket URL. The source poster was
   visually checked and its Facebook image URL returned HTTP 200; that URL
   expires after the show. The exact plan is
   `functions/artifacts/luna-oct8-full-audit/trailside-plan-2026-10-08T19-05-03-974Z.json`.
   The script is `firebase/repair-luna-oct8-trailside.mjs`. It does not alter
   the distinct October 9 John Prine tribute.

Evermoore's October 7 same-day hold is an already past one-off. The prevention
fix covers subsequent same-day posts; this plan does not create an expired
Evermoore listing.

## Apply and verification gates

The `gathr-event-integrity-repair` skill requires exact approval for these live
mutations. Each script defaults to a dry run. `--apply --plan=<exact approved
plan>` re-reads live targets and source siblings, checks fingerprints and update
times against the approved plan, and uses an atomic Firestore batch. If anything
drifts, that script aborts. Complete backups already exist and no media will be
deleted. Apply one script at a time, then re-read every touched path, query the
app detail endpoints and paginated `/api/v2/firestore/events?includeExpired=false`
feed, and record results. Do not touch the GathR map.

## Completed October 8

Craig approved the four exact plans above. Before applying them, Firestore
reported zero running parser locks. All four guarded scripts completed in
sequence and verified their immediate Firestore postconditions:

| Repair | Result artifact |
| --- | --- |
| 11 deletions and Tignish one-off update | `functions/artifacts/luna-oct8-full-audit/live-cleanup-result-2026-10-08T19-06-17-802Z.json` |
| Two PowerSkating parents replaced by 20 one-offs | `functions/artifacts/luna-oct8-full-audit/powerskate-result-2026-10-08T19-06-33-320Z.json` |
| Hunter Friday and Saturday created | `functions/artifacts/luna-oct8-full-audit/hunter-result-2026-10-08T19-06-44-131Z.json` |
| Trailside October 8 created | `functions/artifacts/luna-oct8-full-audit/trailside-result-2026-10-08T19-06-56-639Z.json` |

An independent app API check found HTTP 404 for all 13 deleted event IDs and
HTTP 200 for all 23 created IDs. The Tignish detail endpoint reports
`recurringPattern=none`; the kept events remain HTTP 200. Trailside's detail
metadata exposes `ticketLink=https://www.trailside.ca`. The paginated public
feed returned 1,055 events over 11 pages: zero deleted IDs, all 23 created
IDs, and exactly 20 PowerSkating one-offs, with no unexpected PowerSkating
entry or November 7/8 session. Evidence:
`functions/artifacts/luna-oct8-full-audit/live-repair-api-verify-2026-10-08T19-08-55-462Z.json`.

The existing Friday Laura and Don listing still conflicts with the direct
Hunter flyer; neither source proves whether the acts were sequential or the
later roundup reflected a change. No unapproved edit was made to it. The next
regular full parse is scheduled for an October 9 audit after 11 a.m. Halifax
time, including non-reappearance and duplicate checks.
