# Venue-filtered event feed: missing index repair

Status: **COMPLETE.** The exact additive index is READY and independent public
API verification passed October 15 at 23:57:48 UTC. Craig approved the
recommended index repair with “Ok do that”.

## Verified cause and scope

The serving API's `fetchEvents` uses `collectionGroup('events')`, optional
`where('venueId', '==', ...)`, and ascending `startDate`, `startTime` and
document-path order. A fresh public venue request returned HTTP 500 with
`9 FAILED_PRECONDITION: The query requires an index`. Firestore's generated
index link specifies exactly those fields. The existing live index inventory
has the global date/time index but lacks the venue/date/time index.

The independent before probe confirmed the error and captured complete normal
feeds: 964 default-client events and 972 capable-client events. These counts
are a fresh later-time baseline, not the earlier six-group repair snapshot.

The exact added index is:

- Project `gathr-migrated`, database `(default)`.
- Collection group `events`, query scope `COLLECTION_GROUP`.
- Ascending `venueId`, `startDate`, `startTime`, implicit ascending `__name__`.
- Live index `CICAgOi39IkK`.
- Repository commit `f2abdc8`; both `functions/firestore.indexes.json` and
  `firebase/firestore.indexes.json` preserve all previous entries/field overrides.

Creation used the additive Google Cloud CLI operation documented by
[Google Cloud](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/indexes/composite/create):

```powershell
gcloud firestore indexes composite create --project=gathr-migrated --database='(default)' --collection-group=events --query-scope=collection-group '--field-config=field-path=venueId,order=ascending' '--field-config=field-path=startDate,order=ascending' '--field-config=field-path=startTime,order=ascending' --async --format=json
```

Each field argument must be quoted in PowerShell to preserve its comma. The
initial unquoted command failed argument validation before creating anything.
The accepted operation began at 2026-10-15T23:52:35Z and created the exact index.
No broad Firebase index deployment or deletion of existing indexes was used.
Parser/API source, traffic, models, prompts, date-only publishing policy and
event documents are unchanged by this schema-only repair.

## Verification and evidence

Read-only probe: `firebase/verify-venue-feed-index-oct15-readonly.mjs`.
After READY it checked five venues in default, capable and history modes,
using two-item pagination. All 15 venue cases returned HTTP 200, with no cursor
loops, duplicates or cross-venue leaks; each exactly matched its complete
global-feed subset. The date-window and empty-venue requests also returned 200.
Full normal-feed responses matched the saved pre-change baseline byte-for-byte
after JSON serialization: 964 default and 972 capable events, 10 pages each.
The complete capable history feed contained 1,135 events across 12 pages.
Feed version remains 267. No paid models or map interactions occurred.

Independent after inventory proves exactly one new READY index with the four
required fields (including implicit `__name__`) and all 15 prior indexes
unchanged. Both repository index files contain the additive definition; all
previous definitions and field overrides are preserved. No event documents,
API/parser releases, model settings or publishing gates were changed.

Local evidence under `firebase/artifacts/venue-feed-index-oct15/`:

- `indexes-before.json`: complete pre-change index inventory.
- `api-before.json`: original error and complete feed baselines.
- `create-operation.txt`: accepted index creation receipt.
- `index-status.json`: latest independent index state and fields.
- `indexes-after.json`: complete after inventory, exactly one additive index.
- `api-after.json`: successful final read-only verification at 23:57:48 UTC.

An index-only rollback would remove this exact new index and restore the
original query failure; it must not be substituted for unrelated index cleanup.
