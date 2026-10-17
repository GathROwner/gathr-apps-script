# Dami MCP/input review and shared-post recovery design

## Result

Connected directly to Apify's hosted MCP server, version0.18.4, using only the
anonymous `fetch-actor-details` and `search-actors` metadata tools. Called
`fetch-actor-details` for `dami_studio/facebook-posts-scraper`, actor
`EXNh69YkiB1C2C1Fo`, requesting its input schema, README summary, output schema
and metadata. Read the complete public actor README separately. No actor-execution
tool was exposed or called, no API token used/copied, and no actor was started.
This was a temporary HTTP metadata session, not an installed MCP integration.

The MCP is another interface to the same actor; it does not add a separate
shared-post retrieval capability. Its inferred output schema isn't a guarantee
every optional field or original attachment appears in a particular result.

## Pilot input audit: no overlooked shared-post switch

The current actor schema has exactly these properties:

| Input | Pilot value | Assessment |
|---|---|---|
| startUrls | Two initial25-page batches, then2–3-page and single-page retries | Valid against50-page documented ceiling; initial size was operationally unreliable |
| resultsLimit |20 in every run | Correct; documented maximum, not an accidentally low retrieval limit |
| onlyPostsNewerThan |2026-10-15 | Matches the captured existing-provider input's lower bound |
| onlyPostsOlderThan |2026-10-16T12:40:02.550Z | Valid UTC timestamp, deliberately freezes the original morning comparison cutoff |
| proxyUrls |Omitted | Documented normal/default mode; not a mandatory missing input |

All nine saved run inputs use known fields, string Page URLs, valid ordered date
bounds and the maximum post count. All charges stayed below the respective run
budget. Actor build2.0.56 was pinned, and remains the current latest public build
at this review. Timeout/budget/build settings were API run options rather than
invented actor input fields. For future MCP execution these belong in the tool's
callOptions envelope according to Apify documentation.

There is no includeSharedPosts, expandOriginalPost, sharedAuthor, deeperPagination
or equivalent input property. The audit did not simply forget to enable original
shared content. Small batches remain the demonstrated reliability improvement.
The newest20 are selected before date filtering; a backdated upper cutoff can
further reduce the useful window as newer posts displace older ones. MCP cannot
remove that limitation.

## Craig's proposed second scrape: useful with exact publisher/post discovery

The suggested recovery is plausible, but the target should be the original
publisher and original post, which may differ from the event's attendance venue.
This is an ephemeral acquisition candidate, not permission to create a new public
venue or permanently add a business to the source list.

Reinspection of the nine known shares finds only one whose Dami caption contains
the original author's full literal name. This is not an exhaustive alias/link
discovery score. The known original profiles/post URLs in the table below come
from the existing provider's baseline, not Dami; don't use that oracle in a test
and claim Dami discovered the original automatically.

| Sharing source | Known original publisher | Recovery boundary |
|---|---|---|
| Evermoore |Harbourfront Theatre |Caption names it: good candidate for exact catalog lookup; original post isOctober7, outside theOctober15 lower bound |
| Kool Breeze |Downtown Summerside |Dami caption is only emojis; cannot infer the original from this record. Downtown Summerside was already in the cohort, so avoid assuming a newly added page solves it |
| Robert McMillan Pottery |Potter's Wife of Hope River |Caption doesn't name the original author; a mentioned studio/business is not sufficient provenance |
| Downtown Summerside |Greater Summerside Chamber of Commerce |Generic shopping caption; originalOctober13 post predates the daily window |
| Trailside |Craig Fair Music Productions |Caption names Trailside, but original author is different; originalOctober8 reel predates the window |
| Montague Curling |Ocean100 |Mentions the Scotties and Charlottetown, not original publisher; event venue cannot identify the author |
| CFCY |Prince Edward Island Government |External government article is a possible separate evidence source, not proof of a specific original Facebook share |
| Buenos Island Studio |Personal-profile story |Empty Dami caption, no original public Page profile; outside this actor's reliable public-Page recovery contract |
| Milton Hall |Jonah AKA Elvis |Caption names venue/band, not the original publisher; exact identity required before selecting a post |

Three originals are older than the daily date window:October7,8,13. Rerunning
those original Pages with the original daily cutoff would exclude the desired
content even if it is returned. A widened/omitted lower bound may recover it only
if it remains within the newest20; it cannot force deep history.

## Recommended bounded recovery chain

1. Index complete original records already acquired in the current dataset/cache
   by exact publisher/post/media identity. Reuse only a verified unchanged record;
   don't spend another scrape or parse merely because two pages shared it.
2. Discover an original publisher/post link from explicit source metadata or exact
   canonical evidence. A venue mention is a lookup candidate, not publication proof.
   Public sharing-permalink metadata can be investigated as another discovery
   path; its availability and original-story relation are not validated here.
3. Queue one bounded second scrape per exact original Page. Use an independently
   justified lookback or omit the lower bound for this capped20-post retrieval.
   Don't permanently alter the normal daily window or source catalog.
4. Require an exact original-post relationship before combining sharing context
   with original caption/gallery; a shared name/date is not enough. Preserve both
   publishers, original/share timestamps, gallery order and source URLs. Never
   assign every recovered event to the sharing page or mentioned venue.
5. If original identity is absent, inaccessible, beyond the20-post ceiling, or
   retrieval remains ambiguous, use the existing provider's proven share expansion
   at its supported scope, or retain a visible hold. No guessed original author.
6. Deduplicate acquisitions and publication by stable identities, retaining genuine
   source edits. The same original can already be in the first scrape or shared
   by several pages. Count second-pass/fallback/media cost in the hybrid estimate.

This is a concrete next pilot design, not demonstrated recovery. Next validation
should separate author discovery from content retrieval: test the three known
event-loss shares, the older originals, an already-acquired original and the
unsupported story, without injecting baseline author URLs into the discovery arm.
Any paid actor tests or production implementation require their own defined scope.

## Evidence

Private/local directory: `functions/artifacts/dami-oct17-mcp-review/`:
- mcp-tools.json: actual initialized server identity and exposed tool schemas.
- dami-actor-details.json: actual MCP metadata response and five-property input schema.
- input-and-shared-source-check.json: nine-run validation and exact nine-share comparison.

Original raw inputs/outputs remain in
`C:/Users/craig/Documents/Codex/2026-10-16/gathr-apify-usage-audit-20261016/work/pilot/`.
No source dataset, existing audit artifact, production code/configuration, event,
venue, schedule, subscription or queued job was changed. No paid scraper/model
call, public-image upload or message to another task occurred.

Sources: [Apify MCP documentation](https://docs.apify.com/mcp),
[Dami README and input documentation](https://apify.com/dami_studio/facebook-posts-scraper).
