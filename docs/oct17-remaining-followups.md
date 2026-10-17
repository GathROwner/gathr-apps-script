# October 17 remaining follow-ups

Craig authorized all listed follow-ups after the eight-group repair batch. This
work starts from coordinator commit `d19699d`, branch
`codex/shared-offer-origin-20261014`. The dirty main checkout and previous releases
are preserved. Source investigation is separate from confirmed data corrections.

## Completed: Junior Curling family score

Exact target:
`venues/1ehK5wrBKC460QSpqUMq/events/A3QGhNGCFKfVvEElf4WB`, Junior Curling
(10 and over), Thursdays, 15:30–16:30, Montague Curling Club.

Fresh October17 readback proves the parent still carried family-v4 score15. The
actual released family-v6 scorer returns70 (`child_focused_program`). Two retained
original source snapshots for `1732518712212204` explicitly invite parents to
register their children for Junior Curling. This is participation evidence, not
a beneficiary campaign or generic all-ages admission claim.

The guarded helper defaulted to dry run, checked all five exact source siblings,
two immutable source snapshots, the venue/feed and absence of active parser locks.
The atomic transaction changed only the five family scoring fields plus
`updatedAt` on this parent and feed version300→301 plus its `updatedAt`. Schedule,
recurrence, IDs, venue, source evidence and images were preserved; four siblings
were unchanged. No parser deployment or model call was needed.

Private evidence:

- `firebase/artifacts/oct17-remaining-followups/housekeeping-readback.json`
- `firebase/artifacts/oct17-remaining-followups/junior-family-reviewed-plan.json`
- `firebase/artifacts/oct17-remaining-followups/junior-family-prewrite-backup-2026-10-17T17-26-37-967Z.json`
- `firebase/artifacts/oct17-remaining-followups/junior-family-result-2026-10-17T17-26-37-967Z.json`
- `firebase/artifacts/oct17-remaining-followups/junior-family-api-verification.json`

Independent17:27:05 UTC verification proves exactly two document deltas, seven
untouched read-set documents, detail200, score70/family-v6 and one matching
upcoming occurrence in the complete997-entry/10-page active Preview feed. The
retained source image returned200. These counts are timestamped observations.

The source-sibling inspection also finds older v4 scores on four other programme
and registration records. They were inspected as controls and were not silently
added to the single-parent correction. Original programme commencement wording
must be reviewed independently before any schedule repair; no recurrence dates
were inferred during this family-score refresh.

## Completed: compact test maintenance

The historical October11 legacy-off request fixture predates the accepted
`weekly_custom` prompt wording. Keep that capture immutable. The test now verifies
the original full request hash, permits precisely the already-reviewed recurrence
rule insertion, checks the accepted serving full request hash, and deep-compares
the entire emitted request. It still forbids compact schemas/cache keys when the
switch is off; no assertion, prompt or model contract is relaxed.

- Original request SHA256:
  `b718d2f56c1cdc0df42ecba27d986265c2a45a39508050b3e76e45d41780958d`
- Accepted serving request SHA256:
  `05a5f0c655e2c3d8a15b49ad1ce7b08030db45150aa1918226674748412a92a1`
- **36/36 checks pass** against the exact released parser's compiled code.
- Log: `functions/artifacts/oct17-remaining-housekeeping-qa/compact-qa.log`.

Only the test script changes. No production deployment is required for this
maintenance. Initial QA runs lacked the private fixture path; the passing run
uses the existing assembly's fixture directory without modifying its source or
historical captures.

## Moth Lane clock: investigated, remains held

The original saved image explicitly says Wing Night starts at5pm, with qualifying
drinks after5pm. It is from a shared October14 first-party post. The newer
October16 first-party caption says tonight starting6 till9. The image remains
legible at its captured526×701 resolution; this is not a blur/OCR problem. A newer
share alone does not establish whether the photo's clock or the caption changed.

Public-source searches and direct first-party post access did not supply an
accessible correction for this exact occurrence. Unrelated operating hours and
other dates cannot settle it. No publisher was messaged.

Fresh readback confirms the historical parent
`venues/slug_mothlanebrewing/events/dqtPfabTkUTz0dn2pHVW` remains absent and
`event_integrity_holds/oct17_mothlane_clock_1720610070064632` remains held. The
already-deployed clock guard and source-specific retirement policy remain the
correct disposition. Do not revive or redate this expired occurrence. A future
clear dated first-party post can establish a new occurrence separately.

## Venue and festival source investigations

Independent tasks own separate checkouts and no live mutation targets. Their
read-only Firestore scripts were independently reviewed and executed by the
coordinator because task sandbox restrictions blocked Node access. No broader
permissions were needed. The task waiting tool returned a host error; monitoring
continues through compact task status/turn readbacks.

- Venue task: `01a14ae0-8b42-7e02-abb5-a231c526c19d`, isolated checkout `2dba`.
- Festival task: `01a14ae1-2b51-7972-8088-cb31dd9de0f4`, isolated checkout `3cdd`.

Both tasks finished and are idle. The coordinator read their final reports,
independently checked the decisive sources and reran the released-worker offline
proof. Copies of their private evidence are preserved under this checkout's
`firebase/artifacts/oct17-remaining-followups/{venue-evidence,festival-evidence}/`.
No new monitor or tomorrow-run claim is implied.

## Prepared combined recovery: exact14 operations, not yet applied

The new venue documents were not part of the previously approved21-operation
repair manifest. The event-integrity repair skill requires review of these exact
new creation paths before publication. One combined approval covers the bounded
batch below; no repeated approval is needed for its individual steps.

Reviewed full private plan:
`firebase/artifacts/oct17-remaining-followups/remaining-reviewed-plan.json`.
SHA256 **`9487b8a6afdc5319652af878872c3ebb3d92e9abc6bb78597494bd2a1282e52e`**.
Six venue creates, six one-off event creates, one private Anchor capture replacement,
and feed301→302. No deletes, parser replays, new model calls, new festival links,
venue operating-hours inference or production-code deployment.

| Venue / address | Date and Halifax clocks | Exact new venue path | Event document ID under that venue |
| --- | --- | --- | --- |
| Connor & Kennedy's No Frills,339 University Ave,Charlottetown | Oct20,12:00–16:00 | `venues/place_d5c0c0e38cd71fdd` | `oct17_recovery_e91580a39c6b3b45bc86` |
| Haunted Mansion,81 Victoria St West,Kensington | Oct22,16:00–19:00 | `venues/place_ae278e31081b5555` | `oct17_recovery_ceccf3059aa60dbaf8f3` |
| Summerside Butcher's Shop,470 Central St | Oct27,12:00–16:00 | `venues/place_f12b183ec2b477d2` | `oct17_recovery_9fa4d871c66cda23f10b` |
| Brown's Volkswagen,190 Sherwood Rd,Charlottetown | Nov3,12:00–16:00 | `venues/place_933863c47c88487a` | `oct17_recovery_673e6cdcf93898b6bb94` |
| Highland Bottle & Metal,578 Notre Dame St,Summerside | Nov5,12:00–16:00 | `venues/place_b6bbbbce247714b6` | `oct17_recovery_0d83005538a02348633b` |
| Sobeys Stratford,9 Kinlock Rd | Oct18,12:00–20:00 | `venues/place_cddaaf15d9df257b` | `oct17_recovery_3bcf86fe23b48cf44bbe` |

Each event's full path is its venue path plus `/events/` plus the listed ID. The
five radio visits retain the title Island Wide Food Drive but are exact venue
occurrences. Sobeys is Coats for Kids Donation Day, one-off; the separate mall
depot's daily schedule is excluded. These are collection visits, not distributions
or food specials, and campaign beneficiaries do not receive a family badge.

Eight bounded Places reads supply exact place IDs/points for the candidate
businesses; each was compared with the source's business/city and first-party
address. No lookup was repeated; results are locally cached. These are provider
lookups, not model-generation calls or map UI interactions. Haunted Mansion's
provider metadata says temporarily closed, but its [own explicit2026 season
schedule](https://hauntedmansionpei.ca/) confirms October22 opening, and the
[radio campaign](https://max931.ca/community/island-wide-food-drive/) explicitly
advertises its16:00–19:00 collection visit. Preserve the actual provider status;
do not invent ordinary hours or imply attraction admission. The original owner
HTML is pinned at SHA256
`b0dc705bfd78d93961293d63781601e68de5c0902b565673c9cd252e95a8c18f`.

Brown's owner and provider differ on postal code; the new canonical address
retains their agreed street/city/province and verified point without guessing a
postal code. Business profiles do not borrow the radio/sharing publisher's address,
Facebook identity or logo. Original source URLs, sharing/original-post provenance,
actual Facebook engagement counts, source timestamps and managed event images are
retained. App participation is not copied.

The released parser's `previewFullParserEventWritePayload` constructed all six
actual payloads with an exact injected venue matcher and network/model requests
forbidden. Assertions check source identity, dates, both clocks, one-off recurrence,
venue scope/precision, source images and absence of private review text. This is
offline serialization proof, not a parser replay. The new source IDs use the real
expanded-event identity builder, allowing later ordinary parses to find them.

### Private Anchor correction included

Replace exactly
`festival_link_captures/8b166e1876f6c5234a4ff5202eaea6f16d18747151bce7b4bfbbf73dadf499fb`.
The old complete capture and current failed capture refer to an identical caption
and byte-identical ordered images. Independent worker playback verifies reuse
under the released validation policy. The replacement preserves original model
receipts and embeds the old failure; it explicitly records zero new generation
and that the lost response body was not recovered. The old complete capture stays
unchanged. Public membership does not change and no historical film is revived.

The normal held job is not reset. Its next changed regular-run inventory can use
the repaired capture. A fresh released-worker read-only pass after application
must prove source completeness with zero model calls/public writes. Offline proof
already clears the inventory blocker and proposes zero new links; it still exposes
source-based item holds, so this is not complete automatic festival discovery.

### Guards, backup and verification

Default-dry `firebase/repair-oct17-remaining-recovery.mjs` passed the live preflight
against32 exact read-set documents and complete venue/event identity scans. It
checks no existing destination, place-ID/name/alias collision or matching source
event; pins original source snapshots, review/queue hashes, both Anchor sources
and captures, completion/marker/final367-row batch, job with no active lease,
idle parsers and no direct/queried checkpoint. It rereads these in one transaction
and requires the exact plan SHA. Source or version drift aborts.

After exact approval, the helper writes a full timestamped prewrite backup to
`firebase/artifacts/oct17-remaining-followups/remaining-prewrite-backup-<UTC>.json`
and a separate result receipt before/after the atomic transaction. No private
review schema is changed and no evidence/media is removed.

Prepared independent verifier:
`firebase/verify-oct17-remaining-recovery.mjs`. It checks every intended delta and
untouched control, exactly six public source events, all six detail endpoints,
the complete active Preview feed, one copy per one-off, retained managed media,
and the actual released linker in read-only mode. Post-apply verification has not
run because this batch has not been applied.

## Explicit retained dispositions

- **Kay's:** one advertised joint stop names two neighboring businesses with
  distinct place IDs and points. Keep held; neither two duplicate events nor an
  invented combined canonical business is acceptable. A supported representation
  of this joint site is still needed.
- **Coats distribution:** November7 source names collection partners but no2026
  attendee venue. Prior-year Credit Union Place and the organizer's directory
  address do not prove the current event location. Keep its private hold.
- **Moth Lane:** historical conflicting-clock source stays retired/held, as above.
- **Harvest:** first-party page proves October17,2026 and the four existing linked
  canonical activities. No additional link is justified by this reviewed set.
  Outdoor Play Zone retains a printed18:00 versus website19:00 finish conflict;
  Firepits retains its separate occurrence-identity hold. The current registry
  cannot turn cross-source website facts into literal facts allegedly printed in
  a Facebook gallery; no capture was rewritten. A future private corroboration
  interface could recognize these receipts while preserving item holds. That is
  a separate machine-proof enhancement, not a reason to invent more public events.

Detailed source reports: `docs/oct17-remaining-venue-evidence.md` and
`docs/oct17-remaining-festival-evidence.md`. Current parsers/linker remain at the
accepted serving hashes; only local helpers/tests/docs and the verified Junior
score/feed301 changed in this follow-up session. The next full parse is still
unobserved.
