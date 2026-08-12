# Cornwall PEI Library Repair Checkpoint - 2026-08-12

## Status

Firestore repair completed, parser hardening deployed, and a reusable deployment skill was created.

The repo worktree was already broadly dirty, including files touched by other work. Do not assume all dirty source changes belong to this checkpoint.

## Firestore Repair

Created PEI branch venue:

- `venues/slug_cornwallpubliclibrary`
- Name: `Cornwall Public Library`
- Address: `15 Mercedes Dr, Cornwall, PE C0A 1H0, Canada`
- Google Place ID: `ChIJUVZ4c-ysX0sRL5Gm8vFQsT0`
- Website: `http://www.library.pe.ca/`
- Canonical `facebookUrl` intentionally left blank because `https://www.facebook.com/PEILibrary` is the central PEI library-system page, not a branch-specific Cornwall page.

Restored valid PEI-source future event docs from the prior duplicate-cleanup backup:

- `venues/slug_cornwallpubliclibrary/events/w07butW4Lxv1h0aXE9MZ`
- `venues/slug_cornwallpubliclibrary/events/yZbLu5AY36melSMipkJl`
- `venues/slug_cornwallpubliclibrary/events/RUMnV5PcnI1TFu4ZMJNK`
- `venues/slug_cornwallpubliclibrary/events/KowLCSe43StaCarfy3Qh`
- `venues/slug_cornwallpubliclibrary/events/eLJIqNGK0ngDWvCQtNMf`
- `venues/slug_cornwallpubliclibrary/events/fbDIl4xiY4MrDaKFQyKL`
- `venues/slug_cornwallpubliclibrary/events/Pwas8q7Zcb7nfx8RI56V`
- `venues/slug_cornwallpubliclibrary/events/eFSUVLkCrvwsOKgVB70V`

Skipped:

- `DDykbl1Xre5SC4YTUXC7` because it had already expired on 2026-08-12 at 16:00 Atlantic.
- `Jhk2hzenahX4jJmuMT8G` because the description says fourth Thursday, but 2026-08-20 is the third Thursday; the 2026-08-27 occurrence was restored.

Backup/report:

- `firebase/cornwall_pei_library_repair_2026-08-12T21-04-12-568Z-backup.json`
- `firebase/cornwall_pei_library_repair_2026-08-12T21-04-12-568Z-report.json`

Source cleanup backup that contained the restored docs:

- `firebase/production_strict_duplicate_cleanup_2026-08-12T19-06-45-618Z-backup.json`

## URL Finding

- `https://www.facebook.com/librarycornwallontario` is Cornwall, Ontario.
- `https://www.facebook.com/PEILibrary` is the central PEI Public Library system page.
- `http://www.library.pe.ca/` is PEI.

## Parser Hardening

Implemented and deployed a venue-matching guard for exact-name collisions:

- A PEI Library system source context passes a PE region hint when resolving per-item venues.
- `Cornwall Public Library` with PE hint resolves to `slug_cornwallpubliclibrary`.
- `Cornwall Public Library` with the Ontario Facebook URL still resolves to `slug_librarycornwallontario`.
- `Cornwall Public Library` with no hint now refuses the ambiguous exact-name match instead of falling through to fuzzy matching.

Touched source areas:

- `functions/src/services/firestoreService.ts`
- `functions/src/processing/rowProcessor.ts`
- `functions/src/processing/rowProcessor.stageVenueResolution.test.ts`

These source files were already dirty. Stage/commit them carefully in a later release pass.

## Verification

Commands run:

```powershell
cd C:\Users\craig\Dev\gathr-apps-script\functions
npm run build
node --test lib/processing/rowProcessor.stageVenueResolution.test.js
```

Both passed.

Live matcher probe confirmed:

- PE hint -> `slug_cornwallpubliclibrary`
- Ontario URL -> `slug_librarycornwallontario`
- no hint -> no match

## Deploy

Dry-run passed, then deployed:

```powershell
cd C:\Users\craig\Dev\gathr-apps-script\functions
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated
```

Updated functions:

- `gathr-functions:processDataset(northamerica-northeast2)`
- `gathr-functions:processDatasetResume(northamerica-northeast1)`
- `gathr-functions:processDatasetSelectedRows(northamerica-northeast1)`

Deploy warning observed:

- `firebase-functions` package is outdated.

## Skill Created

Created and validated:

- `C:\Users\craig\.codex\skills\gathr-apps-script-deploy\SKILL.md`
- `C:\Users\craig\.codex\skills\gathr-apps-script-deploy\agents\openai.yaml`

The skill records the correct cwd, project, codebase-qualified Firebase deploy syntax, dry-run requirement, and narrow parser deploy command.

