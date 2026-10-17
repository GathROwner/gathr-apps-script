# October 17 remaining donation venue evidence

Prepared October 17, 2026. Investigation branch `codex/oct17-remaining-venue-evidence`,
starting commit `d19699db4988b35889b6dbc337acd4a512c91582`, isolated checkout
`C:/Users/craig/.codex/worktrees/2dba/gathr-apps-script`.

## Result

The complete current **560-document canonical venue catalog contains no supported
identity for the seven donation locations**. These are missing canonical identities,
not seven missing source locations. Eight separate business candidates are prepared
for seven dated donation sessions because the Kay's stop names two neighboring
businesses. No candidate venue, coordinate, event or queue change was published.

The separate Coats for Kids Summerside distribution has a supported November 7,
10:00–14:00 date/time but **no proved 2026 attendance venue**. Its private hold remains
appropriate. The café is a collection partner, not a supported distribution venue.

Private evidence and the structured proposal:
`functions/artifacts/oct17-remaining-venue-evidence/`. The directory is Git-ignored.
The main review artifact is `reviewed-recovery-proposal.json`; it explicitly sets
`applyReady:false`. No parser/worker code changed; no deployment, live write, replay,
model-generation call, media deletion, map/emulator interaction or publication occurred.

## Evidence reviewed

- Original XLSX rows 27, 103 and 283, original captions/shared captions and ordered
  gallery manifests. Each source has exactly one captured gallery image; all three
  were visually inspected. CFCY's graphic is campaign branding, Sobeys' poster gives
  the exact address/date/year/hours, and Summerside's image is a donation-box graphic
  with no distribution address. No missing gallery panel was assumed.
- Fresh read-only `gathr-migrated` capture at **17:26:43 UTC / 14:26:43 Halifax**:
  560 venues, six CFCY reviews, the Sobeys queue and Coats hold. A full `events`
  collection-group read finds zero public events containing these exact source IDs.
- All canonical names, page names, titles, normalized identities, aliases, URLs and
  slug fields were searched; all address-named fields were separately checked for
  exact normalized street-number/street phrases. No matching business or address
  was found. Inspectable method/results: `catalog-adjudication.json`.
- Current first-party business pages and the original campaign sources below.
  The provincial Royal Gazette supplies the No Frills registration identity.

Near matches were rejected: `venues/slug_mainsthomehardware` is in Souris,
`venues/slug_sportingintentions` is at 190 Minna Jane rather than 167,
`venues/slug_johnbrowngrille` is a restaurant, and
`venues/fb_100063559330971` is Phinley's at 6 Kinlock rather than Sobeys at 9.

## CFCY: six separate collection sessions

Exact source `1735968125204476`, original snapshot
`parse_snapshots/1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g_27_1792240925261`.

Original [CFCY source post](https://www.facebook.com/100063739142275/posts/1735968125204476)
and its [shared CFCY announcement](https://www.facebook.com/951fmcfcy/posts/pfbid0uPeGjgLfm6CFx9pH6KArSaXMEBcZ4ans3gMFeh1659RxSrCmKczZcPx7GcoY9xnhl).
The participating station's [Max 93.1 campaign page](https://max931.ca/community/island-wide-food-drive/)
independently repeats all six named date/time stops. Its undated webpage alone is
not used to invent a year; the saved October 2026 source supplies the campaign
context, and its weekdays align with the dated list.

| Session, Halifax local time | Exact existing review document ID | Candidate identity and address | Evidence/remaining boundary |
| --- | --- | --- | --- |
| October 20, 12:00–16:00 | `cityevt_9820171506b137a15f9312eb` | Connor & Kennedy's No Frills, 339 University Avenue, Charlottetown, PE C1A 4M8 | [Provincial registration](https://www.princeedwardisland.ca/sites/default/files/146b/RG%20Issue%2052-December%2027%202025%20online.pdf), PDF page 24 / printed page 1612, names the business, owner and address. Registration is December 16, 2025; a current owner storefront/entrance confirmation remains desirable. |
| October 22, 16:00–19:00 | `cityevt_1d8f8c8689925f63d077c957` | Haunted Mansion, 81 Victoria Street West, Kensington, PE C0B 1M0 | [Owner location page](https://hauntedmansionpei.ca/location/). Do not retain the queue's umbrella Charlottetown city. |
| October 27, 12:00–16:00 | `cityevt_be9a2226db0c5993d474880c` | Summerside Butcher's Shop, 470 Central Street, Summerside, PE | [Owner website](https://www.summersidebutchershop.com/) explicitly supplies the street address. |
| October 29, 12:00–16:00 | `cityevt_711783010369fad6f5e8e36f` | Kays Wholesale, unit 1–167 Minna Jane Drive; Kays Fresh Market, 167 Minna Jane Drive, Charlottetown, PE | [Wholesale contact](https://www.kayswholesale.ca/contact-us/) and [Fresh Market contact](https://www.kaysfreshmarket.ca/contact) confirm neighboring businesses. The latter explicitly says it is beside Wholesale. One advertised joint stop; confirm the attendee entrance/site representation before choosing one canonical destination. Do not create two event copies or merge the two business identities. |
| November 3, 12:00–16:00 | `cityevt_176747b0b70f4f7fd35d8684` | Brown's Volkswagen, 190 Sherwood Road, Charlottetown, PE C1E 0E4 | [Owner contact](https://www.brownsvw.ca/contactus.html) gives 190; do not adopt a third-party 202 Sherwood listing. |
| November 5, 12:00–16:00 | `cityevt_54ceb3e3eb3abf94c3399853` | Highland Bottle & Metal, 578 Notre Dame Street, Summerside, PE C1N 0M1 | [Owner about page](https://www.hbmetals.ca/about-us) explicitly uses HBM for this Summerside business and gives the address. Mapping the campaign acronym/city to this business is the supported inference; no competing identity was found. HBM must not be expanded to Home Hardware. |

All six document IDs above are under `city_level_event_reviews/`; all remain
`needs_review`. Each session is one-off at its named venue, with the printed finish
on the same date. The campaign's Tuesday/Thursday wording does not create a recurring
series at every venue. These are food-donation collection sessions with a live radio
presence, not food-bank distribution sessions or food specials.

The Kay's owner pages differ on postal code (Wholesale C1E 2A1; Fresh Market C1E 2L9).
The proposed Wholesale candidate deliberately omits postal code pending normalization.
The street/site and distinct business identities are supported. The old 21 MacAleer
address is not used.

## Stratford Sobeys: one donation day

Exact source `1565917082242490`, original snapshot
`parse_snapshots/1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g_103_1792241789885`.
Existing private queue:
`unrecognized_venues/uv_9532e4fe995e32f35d902f3e`, status `manual_review`.

The [original Downtown Charlottetown post](https://www.facebook.com/100064726384797/posts/1565917082242490)
and visually reviewed [original poster](https://www.facebook.com/photo/?fbid=1565916948909170&set=a.549254150575460)
identify **October 18, 2026, 12:00–20:00 at Sobeys, 9 Kinlock Road**.
The [Sobeys-owned store page](https://www.sobeys.com/stores/sobeys-stratford-pei?f=789)
confirms Sobeys Stratford, 9 Kinlock Road, Stratford, PE C1B 1L8 and telephone
902-894-3800. No existing canonical Sobeys identity was found in the full catalog.

Prepared candidate: `sobeys-stratford`; one community donation session collecting
children's winter clothing and monetary donations. Recovery must use `none`
recurrence and the complete source-supported description. The separate daily
Confederation Court Mall depot is not recurrence evidence for Sobeys. The live queue
contains no stored recurrence fields to patch; the bad daily metadata exists in the
saved upstream extraction and must not be copied into the recovered event.

## Summerside distribution: keep held

Exact source `1118550040924946`, snapshot
`parse_snapshots/1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g_283_1792244049272`.
Private hold:
`event_integrity_holds/oct17_coats_distribution_1118550040924946` remains `held`,
reason `attendance_venue_unstated_collection_partner_only`.

The [café share](https://www.facebook.com/100083098820422/posts/1118550040924946)
and original [Wood & Anchor announcement](https://www.facebook.com/permalink.php?story_fbid=pfbid0P7DZ6AwLnyPixak1Pju8bmN7ySijXt6YexpVqvLxqQcrhuMQsSoLLoqLp5Xbp6dil&id=61589001012561)
support the annual free winter clothing distribution on **November 7, 2026,
10:00–14:00**. They name High Rollerz, Waugh's Food Centre, Summerside Waterfront
Café and Bernard's Quik Mart & Laundromat as collection partners. Neither caption
nor the single gallery image names an attendee distribution venue.

The [211 organizer listing](https://pe.211.ca/coats-for-kids-summerside) explicitly
describes **2025** distribution on November 8 at Credit Union Place. It also lists
371 Brophy Street as an organization address. Neither proves the 2026 event venue.
`venues/slug_creditunionplace` exists but must not be selected from historical
association. The [organizer's linked Facebook page](https://www.facebook.com/profile.php?id=61571428385652)
was not readable through the web tool. Bounded public-source searches found no
accessible first-party 2026 location announcement; that is an evidence limitation,
not proof no announcement exists.

Do not revive the retired café parent
`venues/RJ9iYyEWcYUr91hcGSeL/events/2DjVdRAtNrcyKPPgjjQU`, create events for
undated drop-off depots, or remove its accepted source-retirement policy. Recovery
requires a first-party announcement linking this exact November 7 distribution to
its actual venue/address; resolve that venue against a fresh full catalog afterward.

## Bounded coordinator recovery proposal

`reviewed-recovery-proposal.json` contains eight venue candidate fact records,
seven source-specific event candidates, full hashes/update times of the seven
private review records, the canonical catalog hash, and the retained Coats hold.
No destination venue IDs, Google Place IDs, latitude/longitude or event document
paths are fabricated. Consequently this is a reviewed source proposal, not an
executable write plan.

1. Independently review the proposed businesses. Establish an exact canonical
   venue address and trustworthy coordinates for each selected candidate. Confirm
   Kay's attendee entrance and representation, and preferably No Frills' current
   storefront. Keep the two Kay's business identities independent.
2. Prepare and approve the exact new venue documents separately. Refresh the full
   catalog so an intervening canonical addition cannot become a duplicate. Event
   recovery can use a supported subset if another site's venue prerequisites remain
   unresolved; do not force seven publications to satisfy a count.
3. For selected sessions, reread the exact source snapshots, queue/hold fingerprints,
   source siblings across all venues, destination siblings and active parser state.
   Abort on drift, duplicate occurrences, unsupported coordinates or an active run.
4. Prepare final allowlisted event payloads, exact destination IDs and separately
   reviewed queue-resolution metadata. Use captured source facts without a model
   call or row replay. Preserve source URLs and original image provenance; initialize
   app participation data empty. Do not copy the Coats hold's app engagement or
   blanket-copy a queued/retired event.
5. Back up complete touched documents before the coordinator's approved mutation.
   Use guarded create-only public events, preserve private review provenance, and
   retain the Coats distribution hold. Do not rewrite city-review area fields into
   a fabricated venue schema or drain the broad city-centroid publisher.
6. Independently verify exact public fields, one-off clocks/recurrence, details and
   the complete active feed. Verify original managed media availability without
   deleting or rehosting it. Record queue resolution only for the exact recovered
   subset, with destination/source linkage and separately reviewed schema.

Preparation validation succeeded: **560 catalog documents, zero canonical matches,
eight independent venue candidates, seven unique review paths/separate one-off
session fact records, one retained distribution hold**. Local assertions check the
source counts, live private statuses, unique review paths, same-day dates and
absence of recurrence. This validates the proposal's consistency; it does not
substitute for venue creation approval, a dry-run write plan or post-write evidence.
