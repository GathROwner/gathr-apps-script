# Draft support ticket: diagnostic rows charged as Facebook posts

**Status:** Prepared for Craig to review/send; not submitted.

**Subject:** Facebook Posts Scraper billing: empty/unavailable diagnostic rows charged as posts and date-filter results

Hello Apify team,

We use `apify/facebook-posts-scraper` daily for GathR and want to keep using it, but our costs appear to be driven largely by rows that contain no posts. Could you clarify the billing behavior and help us reduce this cost?

## Reproducible example

- Actor ID: `KoJrdxJCTtpon81KY`
- [Run `i0cfrfOdZ96dcNpv9`](https://console.apify.com/actors/KoJrdxJCTtpon81KY/runs/i0cfrfOdZ96dcNpv9)
- Dataset: `2r2EzoHF9PCOcHXHG`
- Actor build: `0.0.403`
- Run date/time: October 17, 2026, 12:37:30–12:39:01 UTC
- Starter account; 320 distinct Facebook page URLs (323 input entries, including three repeated entries)
- Date filter: `onlyPostsNewerThan: "2026-10-16"`
- Actual actor charge: **US$1.836**

The raw dataset contains:

| Row type | Count |
| --- | ---: |
| Post records with a `postId` | 156 |
| `error: "no_items"` | 193 |
| `error: "not_available"` | 18 |
| **Total** | **367** |

The saved run receipt reports:

```json
{
  "chargedEventCounts": {
    "post": 367,
    "actor-start": 1,
    "filter-applied": 367
  }
}
```

The receipt's prices are US$0.004 per post, US$0.001 per date-filter event, and US$0.001 per actor start. They reconcile exactly:

- 367 × US$0.004 = US$1.468
- 367 × US$0.001 = US$0.367
- Actor start = US$0.001
- **Total = US$1.836**

The **211 diagnostic rows account for US$1.055** of that total. They lack a `postId` and post text. For comparison, billing the 156 post records at those same rates plus the start fee would be US$0.781. We understand that checking a page consumes resources; our question is why these diagnostic results count as billable posts and receive the per-post date-filter add-on.

Example diagnostic rows:

```json
{
  "inputUrl": "https://www.facebook.com/PEIshellfish",
  "error": "no_items",
  "errorDescription": "Empty or private data for provided input"
}
```

```json
{
  "error": "not_available",
  "errorDescription": "This content isn't available because the owner only shared it with a small group of people or changed who can see it, or it's been deleted."
}
```

These are diagnostic outcomes, not posts our application chose to discard after scraping. The generic empty/private messages also prevent us from reliably identifying inactive pages in advance.

## Questions / requested resolution

1. Is charging `no_items` and `not_available` rows as `post` events intentional, or is this a billing defect? The receipt describes the event as “Each post written to the dataset.”
2. Why is the **date-filter add-on also charged** on those rows when no post is returned?
3. Is there a supported setting that avoids emitting **and billing** empty/unavailable diagnostic rows while preserving all real posts? Filtering an export after the run would not address the recorded charges.
4. Could diagnostics instead be written to a run summary or key-value store without triggering the post/date-filter events? If this requires a change, can you provide a timeframe or a supported workaround?
5. Can you review this run for a credit of the **US$1.055 attributed to diagnostic rows**, and advise whether the same behavior affects our other recent runs?
6. If this billing is intentional, is there a lower-cost supported daily-monitoring configuration or pricing arrangement that preserves date filtering, shared posts and their original content/media?

We value the scraper's speed and coverage. Our preference is to resolve this billing issue and continue using it. We can supply a small diagnostic-row sample and the saved run billing receipt privately if helpful.

Thank you.

---

## Local evidence notes (omit when submitting)

- Billing source: `functions/artifacts/scraper-one-oct17/official-run-after.json` (`usageTotalUsd`, `chargedEventCounts`, run-specific `pricingInfo`).
- Row source: `functions/artifacts/scraper-one-oct17/official-items.json`, counted directly; diagnostic samples are verbatim selected fields. Missing fields in the examples are not represented as returned null values.
- Exact input source: `functions/artifacts/scraper-one-oct17/official-i0cfrfOdZ96dcNpv9-input.json`. Input uses a URL list; do not attach the private Drive list to a public issue.
- Minimal support evidence: `functions/artifacts/apify-nonpost-billing-oct18/support-evidence.json`.
- Current [published pricing](https://apify.com/apify/facebook-posts-scraper/pricing) was checked October 18; Starter lists US$4/1,000 posts, US$1/1,000 date-filter events and US$0.001 per start, with platform usage included. The calculation above uses the historical run's receipt rather than assuming current prices apply retrospectively.
- US$1.055 is the exact amount attributable to diagnostic rows in this one verified run. Credit entitlement and recurrence across other runs remain questions for support. No monthly savings or refund total has been extrapolated.
