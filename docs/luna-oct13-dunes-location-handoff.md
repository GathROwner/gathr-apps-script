# Dunes source-evidence handoff for the location queue task

Prepared October 13; not sent or applied. Venue resolution remains the
specialized location task's scope.

Queue: `unrecognized_venues/uv_24e6b3b36ceb02a9ffadb4de`.
Source: `1705425784715943`, October 13 dataset row 55, publisher The Sands Darnley.
Source poster: `functions/artifacts/luna-oct13-production-audit/images/055-00.jpg`.

The poster separates retail sale hours (Oct 10-18, 09:00-18:00), lunch service
through Oct 18, and Harvest Feast dinner on Oct 2/3, 9/10 and 16/17. It supplies
no dinner clock. The old queued result is a daily Oct 3 09:00-21:00 dinner;
that payload is not publishable evidence for those dinners.

The parser repair normalizes unknown clocks, protects untimed dining service
regardless of extractor tag, and removes unsupported daily recurrence. Future
runs should retain the time hold. The existing queue payload is not retroactively
repaired by deploying parser code. Before normal venue finalization, inspect
its exact samples, preserve a backup, discard/reparse the bad sample as allowed
by the location workflow, and independently verify serving hours for Oct 16/17.
Do not use the retail opening clock as dinner service or invent a venue/address.

No queue, venue or event write has been made in this originating task. Any
handoff/message or mutation needs the appropriate task authorization.
