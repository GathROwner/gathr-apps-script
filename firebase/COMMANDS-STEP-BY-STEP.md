# GathR-Migrated Setup - Step by Step Commands

Run these commands one at a time in PowerShell. This is the manual version if the automated script has issues.

---

## Prerequisites Check

```powershell
# Check Firebase CLI
firebase --version

# If not installed:
npm install -g firebase-tools

# Check gcloud CLI
gcloud --version

# If not installed, download from:
# https://cloud.google.com/sdk/docs/install
```

---

## Step 1: Authenticate

```powershell
# Login to Google Cloud
gcloud auth login

# Login to Firebase
firebase login

# Verify authentication
gcloud config get-value account
firebase login:list
```

---

## Step 2: Create the Google Cloud Project

```powershell
# Create the project
gcloud projects create gathr-migrated --name="GathR-Migrated"

# Set it as current project
gcloud config set project gathr-migrated
```

**If you get "project ID already exists" error**, the ID must be globally unique. Try:
```powershell
gcloud projects create gathr-migrated-2025 --name="GathR-Migrated"
gcloud config set project gathr-migrated-2025
```

---

## Step 3: Link Billing (Required for Firestore)

```powershell
# List your billing accounts
gcloud billing accounts list

# Link billing (replace BILLING_ACCOUNT_ID with your account ID from above)
gcloud billing projects link gathr-migrated --billing-account=BILLING_ACCOUNT_ID
```

**Or do this in the console:**
1. Go to https://console.cloud.google.com/billing/linkedaccount?project=gathr-migrated
2. Link your billing account

---

## Step 4: Enable Required APIs

```powershell
# Enable all required APIs
gcloud services enable firebase.googleapis.com --project=gathr-migrated
gcloud services enable firestore.googleapis.com --project=gathr-migrated
gcloud services enable firebaserules.googleapis.com --project=gathr-migrated
gcloud services enable identitytoolkit.googleapis.com --project=gathr-migrated
```

---

## Step 5: Add Firebase to the Project

```powershell
firebase projects:addfirebase gathr-migrated
```

**If this fails**, do it manually:
1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Select "gathr-migrated" from existing Google Cloud projects

---

## Step 6: Create Firestore Database

```powershell
# Create Firestore in Native mode, same region as gathr-m1
gcloud firestore databases create --project=gathr-migrated --location=northamerica-northeast2 --type=firestore-native
```

**If you get a region error**, check available regions:
```powershell
gcloud firestore locations list
```

---

## Step 7: Navigate to Firebase Config Directory

```powershell
cd C:\Users\craig\Dev\gathr-apps-script\firebase
```

---

## Step 8: Deploy Firestore Rules

```powershell
firebase deploy --only firestore:rules --project gathr-migrated
```

Expected output:
```
✔  firestore.rules
✔  Deploy complete!
```

---

## Step 9: Deploy Firestore Indexes

```powershell
firebase deploy --only firestore:indexes --project gathr-migrated
```

If prompted about IAM roles, type `Y` and press Enter.

Expected output:
```
✔  firestore.indexes.json
✔  Deploy complete!
```

---

## Step 10: Verify Deployment

```powershell
# Check rules were deployed
firebase firestore:rules:get --project gathr-migrated

# Check indexes (will show CREATING or READY status)
firebase firestore:indexes --project gathr-migrated
```

---

## Step 11: Enable Authentication

```powershell
# This must be done in the console
Start-Process "https://console.firebase.google.com/project/gathr-migrated/authentication"
```

In the console:
1. Click "Get started"
2. Enable "Email/Password" provider
3. Enable "Google" provider (if you use it)

---

## Step 12: Set Admin Custom Claim

Replace `YOUR_EMAIL` with your actual email:

```powershell
firebase auth:set-custom-user-claims YOUR_EMAIL '{"admin": true}' --project gathr-migrated
```

**Note:** The user must exist in Firebase Auth first. Create a test user:
1. Go to Firebase Console -> Authentication -> Users
2. Click "Add user"
3. Enter email and password
4. Then run the command above with that email

---

## Step 13: Get Project Configuration for Your App

```powershell
# Get the web app config (if you create a web app)
firebase apps:sdkconfig web --project gathr-migrated
```

Or get it from the console:
1. Go to https://console.firebase.google.com/project/gathr-migrated/settings/general
2. Scroll to "Your apps"
3. Click "Add app" -> Web
4. Copy the firebaseConfig object

---

## Verification Checklist

Open these URLs to verify everything:

```powershell
# Open Firebase Console
Start-Process "https://console.firebase.google.com/project/gathr-migrated/firestore"

# Open Rules tab
Start-Process "https://console.firebase.google.com/project/gathr-migrated/firestore/rules"

# Open Indexes tab
Start-Process "https://console.firebase.google.com/project/gathr-migrated/firestore/indexes"

# Open Auth tab
Start-Process "https://console.firebase.google.com/project/gathr-migrated/authentication/users"
```

---

## Quick Test Commands

After setup, test the rules work:

```powershell
# Create a test document (should fail as non-admin)
# This is just to verify rules are enforced - failure is expected!

# You'll need to test via your app or the Firebase Console Data tab
```

---

## Troubleshooting

### "Permission denied" errors
```powershell
gcloud auth login --update-adc
firebase login --reauth
```

### "Billing account not found"
Link billing in console: https://console.cloud.google.com/billing

### "Project ID already exists"
Project IDs are globally unique. Add a suffix like `-2025` or your initials.

### Indexes stuck on "CREATING"
This is normal. Indexes can take 5-15 minutes to build. Check status:
```powershell
firebase firestore:indexes --project gathr-migrated
```

### "Firebase project not found"
Make sure you added Firebase to the GCP project:
```powershell
firebase projects:addfirebase gathr-migrated
```
