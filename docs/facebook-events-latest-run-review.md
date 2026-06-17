# Facebook Events Latest Run Review

Run date: 2026-05-18

Actor run: `F6UeWhh9BP6YXZJKp`

Drive file: `11IS1hoeyaNqbUzpf-21fEijwL-2TrRQZ`

Parser run: `ea9a05a6-4718-446f-b77b-422b60a20d28`

## Count Check

| Metric | Count |
| --- | ---: |
| Source Apify event rows | 4 |
| Structured parser candidates | 4 |
| Event docs created | 2 |
| Rows skipped for unresolved venue | 2 |
| Parser fan-out from cover images | 0 |

## Row Review

| Row | Source event | Source date/time | Source venue | Parser outcome | Count result | Notes |
| ---: | --- | --- | --- | --- | --- | --- |
| 0 | `1470349218023121` Christian Howse live @ Bar 1911, Charlottetown, PEI | 2026-06-12 19:30 ADT | `bar1911`, 113 Longworth Ave | Skipped, unresolved venue | 1 source row -> 1 candidate -> 0 writes | Needs venue alias/resolution for `bar1911`. |
| 1 | `2380629425790214` Canada Day Drumming PEI - Victoria Park (Charlottetown) | 2026-07-01 15:15 ADT | Victoria Park, Charlottetown | Skipped, unresolved venue | 1 source row -> 1 candidate -> 0 writes | Needs venue alias/resolution for `Victoria Park, Charlottetown`. |
| 2 | `2647864778929490` SIXX - PAXX: EUROPE'S #1 MALE REVUE - CONFEDERATION CENTRE OF THE ARTS - CHARLOTTETOWN, PEI | 2026-10-09 19:30 ADT | Confederation Centre of the Arts | Created event doc, then test cleanup removed it | 1 source row -> 1 candidate -> 1 write | Venue matched. Category was `Live Music`, which is probably wrong. |
| 3 | `1268974368728257` CHARLOTTETOWN (PEI) - Tribute to ALAN JACKSON, GARTH BROOKS, BRAD PAISLEY & GEORGE STRAIT | 2026-10-10 20:00 ADT | Confederation Centre of the Arts | Created event doc, then test cleanup removed it | 1 source row -> 1 candidate -> 1 write | Venue matched. Category `Live Music` looks correct. |

## Source Row Details

### Row 0

- Event URL: `https://www.facebook.com/events/1470349218023121/`
- Title: `Christian Howse live @ Bar 1911, Charlottetown, PEI`
- Venue candidate: `bar1911`
- Address: `113 Longworth Ave, Charlottetown, PE, Canada C1A 5B1`
- Time: `2026-06-12T22:30:00.000Z`
- Responses: `1 going, 4 interested, 5 responded`
- Outcome: skipped because no venue matched `bar1911`.

### Row 1

- Event URL: `https://www.facebook.com/events/2380629425790214/`
- Title: `Canada Day Drumming PEI - Victoria Park (Charlottetown)`
- Venue candidate: `Victoria Park, Charlottetown`
- Address: `Charlottetown, PE`
- Time: `2026-07-01T18:15:00.000Z`
- Responses: `14 going, 131 interested, 145 responded`
- Outcome: skipped because no venue matched `Victoria Park, Charlottetown`.

### Row 2

- Event URL: `https://www.facebook.com/events/2647864778929490/`
- Title: `SIXX - PAXX: EUROPE'S #1 MALE REVUE - CONFEDERATION CENTRE OF THE ARTS - CHARLOTTETOWN, PEI`
- Venue candidate: `Confederation Centre of the Arts`
- Address: `Confederation Centre (South), 120 Grafton St, Charlottetown, PE C1A, Canada`
- Time: `2026-10-09T22:30:00.000Z`
- Responses: `4 going, 28 interested, 32 responded`
- Outcome: created one event under `slug_confedcentre`, then removed during test cleanup.
- Parser concern: category inferred as `Live Music`.

### Row 3

- Event URL: `https://www.facebook.com/events/1268974368728257/`
- Title: `CHARLOTTETOWN (PEI) -Tribute to ALAN JACKSON, GARTH BROOKS, BRAD PAISLEY & GEORGE STRAIT`
- Venue candidate: `Confederation Centre of the Arts`
- Address: `145 Richmond Street`
- Time: `2026-10-10T23:00:00.000Z`
- Responses: `1 going, 12 interested, 13 responded`
- Outcome: created one event under `slug_confedcentre`, then removed during test cleanup.

## Cleanup

Backup file: `firebase/facebook-events-test-cleanup-backup-2026-05-18T20-20Z.json`

Deleted after backup:

- 2 created event docs
- 2 unrecognized venue queue docs

Verification after cleanup:

- 0 matching event docs remain
- 0 unrecognized venue docs reference this Drive file
