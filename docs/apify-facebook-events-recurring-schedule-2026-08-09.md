# Apify Facebook Events Recurring Schedule

Configured: 2026-08-09

## Live configuration

- Actor: `apify/facebook-events-scraper` (`UZBnerCFBo5FgGouO`)
- Actor task: `gathr-pei-facebook-events-weekly` (`xIalre4QX2Qg0m8AT`)
- Schedule: `gathr-pei-facebook-events-weekly` (`6h3i5cpkb1kY9Fg9c`)
- Cadence: Mondays at 06:00 in `America/Halifax` (`0 6 * * 1`)
- Schedule enabled: yes
- Exclusive execution: yes; overlapping scheduled runs are skipped
- Failure email notifications: enabled
- First scheduled run: 2026-08-10T09:00:00.000Z (06:00 ADT)

## Search and cost guardrails

The task uses explicit PEI community searches rather than the broad query
`Prince Edward Island events`, which returned an event located in Maine during
validation.

- Charlottetown PEI events
- Summerside PEI events
- Stratford PEI events
- Cornwall PEI events
- Montague PEI events
- Souris Prince Edward Island events
- Kensington PEI events
- Cavendish PEI events

Actor input `maxEvents` is 25. Apify applies this per search query, so the task
also has independent run-level limits:

- `maxItems`: 100
- `maxTotalChargeUsd`: 1.05
- `timeoutSecs`: 900
- `memoryMbytes`: 1024
- `restartOnError`: false

At the current Bronze actor price of USD 0.01 per event plus USD 0.001 per run,
a full 100-item weekly run is approximately USD 1.001, or about USD 4.34 per
average month, before any unrelated Apify usage.

## Post-first-run hardening (2026-08-10)

- The Souris query was expanded from `Souris PEI events` to
  `Souris Prince Edward Island events` to reduce ambiguity with similarly named
  places outside the province.
- Structured Facebook Event coordinates are preserved by the Drive adapter and
  checked before venue matching. Rows unmistakably outside the configured
  ingest jurisdictions are rejected before they can create a suspicious venue
  match or unknown-venue review.
- The ingest jurisdiction is configurable with
  `EVENT_INGEST_ALLOWED_REGIONS` and defaults to `PEI`. Province boundaries live
  in one registry so expansion requires adding the new province entry and
  enabling its code (for example, `PEI,NS`), rather than adding PEI-only checks
  throughout the parser.
- The `maxEvents`, `maxItems`, and charge limits above were not changed.

## Existing handoff

The existing actor-level webhook `5R34Y9P2h36LuUKmy` listens for succeeded,
failed, aborted, and timed-out runs of this actor and posts them to the deployed
`apifyWebhook` function. The webhook then uses the existing Drive export or
direct Apify dataset fallback and enqueues `processDatasetResume`.

## Live validation

- Test actor run: `Js1By70WgvXqGpid9`
- Dataset: `jZMUhyTd0hcla7fPX`
- Drive export: `1sjzVWTlkIitoaYAWRdvLkHigYyFGgaVU`
- Actor status: succeeded; 53 HTTP requests, 0 failed requests
- Actor cost: USD 0.131
- Webhook record: `apify_webhooks/oqQ4MNtGQSzXQsCsPter`, completed
- Processing run: `dd983005-be76-4722-ad4d-03773f333210`, completed
- Future rows processed: 12
- Invalid rows: 1
- Parser errors: 0
- New standard events: 3
- Existing standard events updated: 2
- Parse snapshots: 12

The actor returned past rows, but the existing local future-event filter kept
them out of parser processing. The structured Facebook Events adapter completed
without GPT calls or cover-image fan-out.

## Validation residue requiring normal review

The discarded broad province query returned `Prince Edward Island Kitchen
Party with Cynthia & Gordon`, physically located at Black Moon Public House in
Ellsworth, Maine. It created the existing manual-review queue record
`unrecognized_venues/uv_367996c76d93bea9f255abd9`. It was not deleted as part
of schedule setup; handle it through the normal approval-gated unknown-venue
review workflow.
