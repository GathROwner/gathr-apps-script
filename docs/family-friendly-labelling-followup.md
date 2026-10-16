# Family-friendly labelling audit — requested October 16

Status: future work requested by Craig. Do not mix this investigation into the
current area-location presentation release or change labels without evidence.

## Starting observation

Craig reports many suitable events lack the app's family-friendly label. His
example is `events/oct15_kensington_skeleton_week`, Kensington Skeleton Selfie
Hunt, October 14–18. The source invites participation at local skeleton
displays; the app screenshots show no family-friendly badge. Treat this as a
reported likely omission, not proof that the parser alone lost the flag.

## Planned investigation

1. Trace source evidence through extraction, validation, final formatting,
   duplicate/refresh merging, Firestore, API projections, normalization and
   badge rendering. Separate missing parser decisions from dropped fields
   or a display defect.
2. Review a representative sample of recent accepted/rejected sources,
   captions and ordered available galleries. Measure both missed family
   activities and incorrect family-friendly assignments.
3. Establish an explicit policy for all-ages participation, children/family
   invitations, age limits, adult-only activities, mixed festival programmes,
   uncertain suitability and venue-specific access. A pub stop alone does
   not establish whether the particular activity admits children.
4. Preserve unknown/conflicting age evidence; a missing 19+ statement alone
   is insufficient evidence of family suitability. Do not confuse
   family-friendly, child-focused, accessible, or free admission.
5. Propose narrow source-grounded parser/persistence safeguards with
   deterministic fixtures and healthy adult-only/ambiguous controls. Validate
   against historical source cohorts before any deployment or backfill.

Report a concise evidence-based recommendation and exact affected records for
any subsequent live repair batch. No automatic relabelling, broad backfill,
new schedule, or paid experiment is part of the current request.

## October 16 source cohort saved before this investigation

The completed regular full-run audit is in `docs/luna-oct16-production-audit.md`.
Private source, snapshot, usage, current record/API and gallery evidence is in
`functions/artifacts/luna-oct16-production-audit/`. Its156 model-source rows and
155 touched parents provide an initial cohort, not an accuracy estimate:
153 parents are `unlikely`, one `high`, one lacks a level. Thirteen original
gallery references could not be downloaded and must remain explicit limits.

Add these cases to the source-to-badge investigation:

- `venues/4OcLMCRKRGoKO5eQncLi/events/vienqEqn0AgXiVcebm4G`: farm-animal
  visit with family rates, score15/insufficient-family-evidence.
- `venues/slug_sobeyfamilytheatre/events/ARClj8Qo5mCWzpZCI4GF`: Symphony
  schedule line with score0 and `alcohol_focused`; inspect mixed-post evidence
  leakage. A theatre's name alone does not establish family suitability.
- Healthy positive control: Harvest Fest's explicit all-ages invitation,
  score100. Healthy adult control: Be You's explicit19+, score0.

No labels were changed by that audit. Resolve its recurrence/timing and other
confirmed integrity failures before combining policy changes with a new parse.
