# Stationary preparation renewal (local source; not deployed)

The existing `discoverNearbyCheckInPlacesCallable` accepts optional
`renewPreparationPool: {poolId, readinessSessionId}` together with
`preparation: true` and the usual fresh location fields. Presence of that field
selects a renewal-only branch: eight requests per hour, including rejected
attempts. It cannot call a provider, mint a candidate, or fall through to ordinary
discovery. Ordinary discovery retains its existing20/day rate and all callable
App Check/auth/capacity options.

A complete normal preparation (including a genuine empty result) atomically
stores one server-only metadata document in `checkInPlaceCandidates`, at
`<uid>__nearby_preparation_pool`. Its mode/id cannot satisfy the existing
candidate validators. It contains the original generation, original area,
at most20 candidate IDs and immutable identity hashes, provenance, original
discovery time, and15-minute expiry. Partial preparation advertises no renewable
pool and creates no metadata. Existing rules deny client reads/writes; existing
candidate cleanup and account-data cleanup cover the metadata too.

Renewal requires a current, active, unbound/unconsumed server readiness session
with Here30 seconds, an unexpired qualified arrival and owner, a qualifying
server sample within60 seconds, and a fresh raw fix with accuracy at most50m.
The raw fix, latest server fix and qualified arrival must each be within20m of
the ORIGINAL discovery point. Place binding still requires90 seconds; renewal
does not award dwell credit or create an eligibility grant. Expired active
check-in documents use the same expiry semantics as readiness.

Every original external candidate must still exist, belong to the user, be
unexpired and unconsumed, and match its original immutable identity. One bad
candidate rejects the entire renewal. A Firestore transaction extends only
candidate `expiresAt` and metadata `expiresAt`/`lastPresenceAt`; IDs, targets,
creation time, source and one-use semantics remain unchanged. Concurrent
consumption/deletion conflicts cause transaction revalidation. No expired or
consumed candidate can be revived.

The lease is15 minutes from valid presence, capped at SIX HOURS from the original
successful discovery. At that boundary a normal charged discovery is required.
A regional pool additionally revalidates current catalogue coverage, integrity,
version, source timestamp and the existing seven-day LOCAL POC age policy.
That dataset-age policy is separate from the six-hour discovery-result cap.

Canonical choices use fresh numeric-latitude and legacy-string-latitude queries,
retaining existing1000/500 result caps and explicit incomplete failure. They are
queried around the original point. The response continues to claim the original
175m circle, not a shifted circle. Final target eligibility remains authoritative.

Response capability:

```
preparationPool: {
  id, expiresAtMs, refreshAtMs, sourceExpiresAtMs,
  originLatitude, originLongitude
}
preparationReused: false // complete normal preparation
preparationReused: true  // successful renewal only
```

`refreshAtMs` is ten minutes from presence, capped at lease expiry. The client
must require the genuine reuse acknowledgement and identical original external
IDs/keys before extending its cache; unknown/legacy responses must not imply a
free renewal. Recognized renewal-only refusals use details.condition:

- `rediscovery_required`: invalid, replaced, moved, expired, consumed or
  incompatible/stale-source pool; one ordinary charged retry can be requested.
- `preparation_renewal_unqualified`: fresh qualified presence is missing; wait
  for evidence rather than performing ordinary discovery automatically.
- `preparation_renewal_rate_limited`: eight/hour renewal allowance exhausted;
  retry later, without an ordinary-discovery fallback.

Cost bounds (per request, excluding transaction conflict retries): ordinary
complete preparation adds one metadata write; external mint writes stay at most
20. Renewal adds no provider requests or new UUIDs. Wrapper rate check costs one
document read/write; renewal transaction reads four guards plus at most20
candidate documents and writes at most20 candidate expiries plus one metadata
expiry. Fresh canonical work uses two existing bounded queries, at most1502
returned documents before explicit overflow refusal (1001 numeric +501 string).
At empty query results Firestore minimum query-read billing still applies.
Eight hours of continuous valid stationary presence at ten-minute cadence uses
two ordinary discoveries and47 renewals, rather than repeated provider discovery
every five minutes. Missed presence beyond the15-minute lease requires ordinary
charged discovery; this is intentionally bounded rather than indefinite cache.

Validation receipts are in the task root (`preparation-renewal-*.log`). They are
local offline/domain + isolated Firestore checks; native adoption and release
are separate gates owned by the coordinator. No QA serving files or production
resources are changed by this source work.

Final local results: full TypeScript build and focused ESLint passed;72/72
offline regression cases passed (22 renewal cases plus existing arrival,
catalogue and provider cases);5/5 actual Firestore/callable-wrapper integration
cases and2/2 rendered manifest/auth cases passed. Integration uses only
`demo-gathr-preparation-renewal` on existing loopback Firestore8097, with no reset,
Auth account creation or external provider calls. It covers the unchanged
20/day guard, all-attempt8/hour guard, concurrent consumption/renewal, concurrent
renewals, another user, and a new ordinary discovery replacing the generation.
The wrapper is executed in-process; this is not an HTTP or native transport
claim. The eight-hour clock test is deterministic simulation, not eight hours
of wall-clock native observation.
