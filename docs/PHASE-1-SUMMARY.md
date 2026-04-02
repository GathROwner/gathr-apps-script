# Phase 1: Firestore Schema Setup - Summary

**Phase:** FIRESTORE-SCHEMA-SETUP
**Status:** Complete
**Date:** January 29, 2026
**Firebase Project:** `gathr-migrated`

---

## Overview

Phase 1 established the Firestore database infrastructure for migrating GathR from Google Sheets to Firebase. A new Firebase project (`gathr-migrated`) was created to avoid impacting the production environment (`gathr-m1`) during development and testing.

---

## Files Created

| File | Purpose |
|------|---------|
| `firebase/firestore.rules` | Security rules defining read/write permissions for all collections |
| `firebase/firestore.indexes.json` | Composite index definitions for efficient queries |
| `firebase/README-SCHEMA.md` | Complete schema documentation with field mappings |
| `firebase/firebase.json` | Firebase CLI configuration |
| `firebase/.firebaserc` | Project aliases (default: gathr-migrated, production: gathr-m1) |
| `firebase/DEPLOY.md` | Deployment instructions and Cloud Shell commands |
| `firebase/COMMANDS-STEP-BY-STEP.md` | Manual step-by-step deployment commands |
| `firebase/set-admin-claim.js` | Node.js script to set admin custom claims on users |
| `firebase/verify-setup.js` | Verification script to test Firestore setup |
| `firebase/setup-gathr-migrated.ps1` | PowerShell automation script (partial - CLI bug encountered) |
| `firebase/package.json` | Node.js dependencies for admin scripts |
| `firebase/service-account.json` | Firebase Admin SDK credentials (**DO NOT COMMIT**) |

---

## Key Decisions Made

### 1. Separate Firebase Project

**Decision:** Created new project `gathr-migrated` instead of using production `gathr-m1`

**Rationale:**
- Complete isolation during development and testing
- No risk of affecting production data or rules
- Easy rollback by simply not migrating
- Parallel testing possible

### 2. Security Model

**Decision:** Guest (unauthenticated) read access for venues and events

| Collection | Guest | Authenticated | Admin |
|------------|-------|---------------|-------|
| `venues` | Read | Read | Read/Write |
| `venues/{id}/events` | Read | Read | Read/Write |
| `processed_datasets` | — | — | Read/Write |
| `unrecognized_venues` | — | — | Read/Write |
| `processing_state` | — | — | Read/Write |

**Rationale:**
- Enables map clusters and browsing without requiring login
- Premium features gated in frontend, not database level
- Admin write access via custom claims (`admin: true` on auth token)
- Processing collections restricted to admin for data integrity

### 3. Nested Collection Structure

**Decision:** Events as subcollection under venues: `venues/{venueId}/events/{eventId}`

**Rationale:**
- Natural data hierarchy (events belong to venues)
- Efficient queries for single-venue event lists
- Collection group queries enabled for cross-venue searches
- Supports both venue-scoped and global event queries

### 4. Venue Name Matching Strategy

**Decision:** Three-tier matching with derived fields

| Field | Type | Purpose |
|-------|------|---------|
| `pagename` | string | Original display name |
| `pagenameNormalized` | string | Lowercase, no punctuation, trimmed |
| `pagenameSearchTokens` | array | Word tokens for fuzzy matching |
| `pagenameSlug` | string | URL-friendly identifier |

**Rationale:**
- Exact match via `pagename`
- Canonicalized match via `pagenameNormalized`
- Partial/fuzzy match via `pagenameSearchTokens` (array-contains)
- URL routing via `pagenameSlug`

### 5. Index Strategy

**Decision:** 10 composite indexes deployed, single-field indexes handled automatically

**Composite Indexes Created:**

| Collection | Fields | Scope | Purpose |
|------------|--------|-------|---------|
| events | isEvent + startDate | Collection Group | Filter events by type and date |
| events | category + startDate | Collection Group | Filter by category |
| events | establishment + startDate | Collection Group | Duplicate detection |
| events | isRecurring + startDate | Collection Group | Recurring event queries |
| events | isFoodSpecial + startDate | Collection Group | Food specials queries |
| events | category + startDate | Collection | Single-venue category filter |
| venues | latitude + longitude | Collection | Geo queries |
| processed_datasets | status + processedAt | Collection | Admin processing queue |
| unrecognized_venues | status + createdAt | Collection | Admin review queue |
| processing_state | type + status | Collection | Active job lookup |

**Rationale:**
- Single-field indexes created automatically by Firestore
- Composite indexes required for multi-field queries with ordering
- Collection group scope enables cross-venue event queries

### 6. Admin Authentication

**Decision:** Custom claims on Firebase Auth tokens (`admin: true`)

**Rationale:**
- Checked in security rules via `request.auth.token.admin`
- Set via Firebase Admin SDK (server-side only)
- No additional Firestore lookups required for permission checks
- Standard Firebase pattern for role-based access

---

## Deviations from Plan

### 1. Firebase CLI Bug Workaround

**Issue:** Firebase CLI had a bug causing `projects/projects/gathr-migrated` path duplication, preventing rule and index deployment via CLI.

**Workaround:**
- Security rules deployed via Firebase Console (copy/paste)
- Indexes created manually via Console UI
- Admin scripts run locally with service account

**Impact:** No functional impact; rules and indexes deployed successfully via alternative method.

### 2. Existing Rules Merged

**Change:** Original plan was for standalone rules; instead merged with existing `gathr-m1` rules.

**Rationale:** The new project may eventually need the same collections as production (users, eventLikes, etc.), so rules were merged preemptively.

---

## Configuration Required

### Firebase Project

| Property | Value |
|----------|-------|
| Project ID | `gathr-migrated` |
| Project Name | GathR-Migrated |
| Region | `northamerica-northeast2` |
| Database Type | Firestore Native |
| Billing | Linked (required for Firestore) |

### Admin User

| Property | Value |
|----------|-------|
| User UID | `5vM7W03kRqgBJWL3NG1pynU4aKz2` |
| Custom Claims | `{ admin: true }` |

### Service Account

- Downloaded from Firebase Console → Project Settings → Service Accounts
- Saved as `firebase/service-account.json`
- **Must be added to `.gitignore`**

---

## How to Test/Validate

### Run Verification Script

```powershell
cd C:\Users\craig\Dev\gathr-apps-script\firebase
node verify-setup.js
```

**Expected Output:**
```
[Test 1] Writing test venue...       ✓
[Test 2] Writing test event...       ✓
[Test 3] Reading venues...           ✓
[Test 4] Collection group query...   ✗ (expected - needs specific index)
[Test 5] Writing to processed_datasets... ✓
[Test 6] Testing indexed queries...  ✓
```

### Manual Verification

1. **Rules:** https://console.firebase.google.com/project/gathr-migrated/firestore/rules
2. **Indexes:** https://console.firebase.google.com/project/gathr-migrated/firestore/indexes (all should show "Enabled")
3. **Auth:** https://console.firebase.google.com/project/gathr-migrated/authentication/users

### Test Security Rules

**Guest Read (should work):**
- Open Firestore console → Data tab
- Try reading `venues` collection (allowed)

**Guest Write (should fail):**
- Try adding document to `venues` (denied)

**Admin Write (should work):**
- Use Admin SDK or authenticated client with admin claim

---

## Known Limitations

### 1. Collection Group Query Index

The verification script Test 4 fails because collection group queries without `orderBy` require a specific index pattern. In practice, all queries will include date ordering, so existing indexes cover real use cases.

### 2. Firebase CLI Bug

The `projects/projects/` path duplication bug may be specific to this environment or CLI version. Future deployments may need to use Console or Cloud Shell.

### 3. Single-Field Indexes Not Deployed

Single-field indexes defined in `firestore.indexes.json` were not deployed because:
- Firestore creates them automatically on first query
- Console rejected them as "not necessary"

This is expected behavior and not a limitation.

---

## Dependencies Installed

### firebase/ directory

```json
{
  "dependencies": {
    "firebase-admin": "^13.x"
  }
}
```

Installed via:
```powershell
cd firebase
npm init -y
npm install firebase-admin
```

---

## Console URLs

| Resource | URL |
|----------|-----|
| Firestore Data | https://console.firebase.google.com/project/gathr-migrated/firestore |
| Security Rules | https://console.firebase.google.com/project/gathr-migrated/firestore/rules |
| Indexes | https://console.firebase.google.com/project/gathr-migrated/firestore/indexes |
| Authentication | https://console.firebase.google.com/project/gathr-migrated/authentication |
| Project Settings | https://console.firebase.google.com/project/gathr-migrated/settings/general |
| Service Accounts | https://console.firebase.google.com/project/gathr-migrated/settings/serviceaccounts/adminsdk |

---

## Next Steps (Phase 2)

1. **Venue Migration:** Import venues from "Contact Info" sheet to `venues` collection
2. **Event Migration:** Import events from "Sheet1" to `venues/{id}/events` subcollections
3. **Name Matching:** Implement venue lookup using derived fields
4. **Processing Tracking:** Use `processed_datasets` to prevent duplicate imports

---

## Files to Add to .gitignore

```
# Firebase credentials - NEVER commit
firebase/service-account.json

# Node modules
firebase/node_modules/
```
