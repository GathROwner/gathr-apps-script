# Firebase Deployment Instructions for GathR

## Files Created
- `firebase.json` - Firebase project configuration
- `.firebaserc` - Project alias (gathr-m1)
- `firestore.rules` - Security rules (merged with existing)
- `firestore.indexes.json` - Composite indexes (includes existing pageSubmissions index)

---

## Option A: Deploy via Google Cloud Shell (Recommended)

### Step 1: Upload files to Cloud Shell

In Cloud Shell, create a directory and upload the files:

```bash
# Create directory
mkdir -p ~/gathr-firebase && cd ~/gathr-firebase

# Create the files (copy-paste each command)
```

Then copy-paste these commands one at a time:

**Create firebase.json:**
```bash
cat > firebase.json << 'EOF'
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
EOF
```

**Create .firebaserc:**
```bash
cat > .firebaserc << 'EOF'
{
  "projects": {
    "default": "gathr-m1"
  }
}
EOF
```

**Create firestore.rules:**
```bash
cat > firestore.rules << 'RULESEOF'
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAccessingOwnData(userId) {
      return request.auth.uid == userId;
    }

    function isAdmin() {
      return isAuthenticated() && request.auth.token.admin == true;
    }

    // EXISTING: Users collection
    match /users/{userId} {
      allow read, write: if isAuthenticated() && isAccessingOwnData(userId);
    }

    // EXISTING: Interests collection
    match /interests/{interestId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }

    // EXISTING: Page submissions collection
    match /pageSubmissions/{submissionId} {
      allow create: if isAuthenticated();
      allow read: if isAuthenticated();
      allow update, delete: if false;
    }

    // EXISTING: Event likes collection
    match /eventLikes/{eventId} {
      allow read, write: if isAuthenticated();
    }

    // EXISTING: Event shares collection
    match /eventShares/{eventId} {
      allow read: if true;
      allow create: if isAuthenticated()
                    && request.resource.data.count is number
                    && request.resource.data.count >= 0;
      allow update: if isAuthenticated()
                    && request.resource.data.count is number
                    && request.resource.data.count > resource.data.count;
    }

    // EXISTING: Event users responded collection
    match /eventUsersResponded/{eventId} {
      allow read: if true;
      allow write: if isAuthenticated();
    }

    // NEW: Venues collection (public read, admin write)
    match /venues/{venueId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();

      // Events subcollection
      match /events/{eventId} {
        allow read: if true;
        allow create, update, delete: if isAdmin();
      }
    }

    // NEW: Collection group query for events
    match /{path=**}/events/{eventId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // NEW: Processing collections (admin only)
    match /processed_datasets/{datasetId} {
      allow read, write: if isAdmin();
    }

    match /unrecognized_venues/{venueId} {
      allow read, write: if isAdmin();
    }

    match /processing_state/{stateId} {
      allow read, write: if isAdmin();
    }

    // NEW: Admins collection
    match /admins/{adminId} {
      allow read: if isAuthenticated() && request.auth.uid == adminId;
      allow write: if isAdmin();
    }

    // DEFAULT: Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
RULESEOF
```

**Create firestore.indexes.json:**
```bash
cat > firestore.indexes.json << 'EOF'
{
  "indexes": [
    {
      "collectionGroup": "pageSubmissions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "submittedAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "venues",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "pageurl", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "venues",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "pagename", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "venues",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "pagenameNormalized", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "venues",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "pagenameSlug", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "venues",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "latitude", "order": "ASCENDING" },
        { "fieldPath": "longitude", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "startDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "isEvent", "order": "ASCENDING" },
        { "fieldPath": "startDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "startDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "establishment", "order": "ASCENDING" },
        { "fieldPath": "startDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "isRecurring", "order": "ASCENDING" },
        { "fieldPath": "startDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "isFoodSpecial", "order": "ASCENDING" },
        { "fieldPath": "startDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "startDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "startDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "processed_datasets",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "processedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "processed_datasets",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "filename", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "unrecognized_venues",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "unrecognized_venues",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "establishmentNormalized", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "processing_state",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": [
    {
      "collectionGroup": "venues",
      "fieldPath": "pagenameSearchTokens",
      "indexes": [
        { "order": "ASCENDING", "queryScope": "COLLECTION" },
        { "arrayConfig": "CONTAINS", "queryScope": "COLLECTION" }
      ]
    },
    {
      "collectionGroup": "venues",
      "fieldPath": "categories",
      "indexes": [
        { "order": "ASCENDING", "queryScope": "COLLECTION" },
        { "arrayConfig": "CONTAINS", "queryScope": "COLLECTION" }
      ]
    }
  ]
}
EOF
```

### Step 2: Verify files and authenticate

```bash
# Check files were created
ls -la

# Verify Firebase CLI is authenticated
firebase whoami

# If not authenticated, login (Cloud Shell should auto-auth)
firebase login --no-localhost
```

### Step 3: Deploy rules

```bash
firebase deploy --only firestore:rules --project gathr-m1
```

### Step 4: Deploy indexes

```bash
firebase deploy --only firestore:indexes --project gathr-m1
```

If prompted about IAM roles, press Enter to select Yes.

### Step 5: Verify deployment

```bash
# Check current rules
firebase firestore:rules:get --project gathr-m1

# Check index status (will show CREATING or READY)
firebase firestore:indexes --project gathr-m1
```

---

## Option B: Deploy via Local PowerShell

If you have Firebase CLI installed locally:

```powershell
# Navigate to firebase folder
cd C:\Users\craig\Dev\gathr-apps-script\firebase

# Login to Firebase
firebase login

# Deploy rules
firebase deploy --only firestore:rules --project gathr-m1

# Deploy indexes
firebase deploy --only firestore:indexes --project gathr-m1
```

---

## Setting Admin Custom Claim

To set yourself as admin (required for write access to venues/events):

### Option 1: Via Firebase CLI in Cloud Shell
```bash
firebase auth:set-custom-user-claims YOUR_EMAIL_OR_UID '{"admin": true}' --project gathr-m1
```

### Option 2: Via your existing Express backend

Since your backend already has firebase-admin initialized, add this temporary endpoint to server.js:

```javascript
// TEMPORARY: Add to server.js, remove after use
app.post('/admin/set-admin-claim', async (req, res) => {
  const { uid, secret } = req.body;

  // Simple secret check - use a strong value
  if (secret !== 'YOUR_TEMPORARY_SECRET_HERE') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    res.json({ success: true, message: `Admin claim set for ${uid}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

Then call it:
```bash
curl -X POST http://your-backend/admin/set-admin-claim \
  -H "Content-Type: application/json" \
  -d '{"uid": "YOUR_UID", "secret": "YOUR_TEMPORARY_SECRET_HERE"}'
```

---

## Verification Checklist

After deployment, verify in Firebase Console:

- [ ] **Rules tab**: Shows merged rules with venues, events, and processing collections
- [ ] **Indexes tab**: Shows ~19 indexes (some may show "Building" status initially)
- [ ] **Test read as guest**: Should work on venues collection
- [ ] **Test write as guest**: Should fail on venues collection
- [ ] **Test write as admin**: Should work after setting custom claim

---

## Troubleshooting

**"Permission denied" on deploy:**
```bash
gcloud auth login
firebase login --reauth
```

**Indexes stuck in "CREATING":**
Indexes can take 5-15 minutes to build. Check status with:
```bash
firebase firestore:indexes --project gathr-m1
```

**Rules not updating:**
Force refresh:
```bash
firebase deploy --only firestore:rules --project gathr-m1 --force
```
