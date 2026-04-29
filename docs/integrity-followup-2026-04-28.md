# Integrity Follow-Up 2026-04-28

Branch:
- `codex/integrity-wet-2026-04-28`

Base:
- created from the live-aligned hotfix branch/worktree at commit `641fff8`

Why this branch exists:
- the broader `codex/write-path-consistency` line already contains unrelated parser drift versus live
- wet reruns for the April 28 integrity issues need a narrow live-based deploy slice

Integrity scan being addressed:
- `firebase/tmp_recurrence_integrity_report_2026-04-28.json`

Initial issue groups:
1. Tipsy Farmers lunch specials
- explicit `11-2pm` ranges landed as `23:00-14:00`
- expected fix lane: explicit range recovery

2. Soul Fit PEI grouped Saturday classes
- short classes landed with broad `21:00` end times
- expected fix lane: grouped sibling end-time fallback

3. Summerside Rotary Library / Teen Advisory Group
- short-form program landed with `23:00` category-default close time
- expected fix lane: duration-default override for short-form program rows

4. Milton Community Hall
- stale recurring docs remain live even though the traced source row now emits one-offs
- treat as rerun/manual cleanup lane after parser fixes, not as the first code patch lane

Current live-slice patch scope:
- `functions/src/parsing/postParser.ts`
- `functions/src/parsing/postParser.integrityFollowup.test.ts`

Deliberate exclusions from this branch:
- no rowProcessor work
- no unknown-venue work
- no venue-sweep cleanup logic changes
- no unrelated parser routing changes from the broader development branch
