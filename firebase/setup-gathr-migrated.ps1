# ============================================================================
# GathR-Migrated Firebase Project Setup Script
# ============================================================================
# This script creates a new Firebase project and deploys Firestore rules/indexes
# Run this in PowerShell as Administrator (for npm global installs if needed)
# ============================================================================

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ID = "gathr-migrated"
$PROJECT_NAME = "GathR-Migrated"
$REGION = "northamerica-northeast2"  # Same region as gathr-m1
$FIREBASE_DIR = "C:\Users\craig\Dev\gathr-apps-script\firebase"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "GathR-Migrated Firebase Setup Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# STEP 1: Check Prerequisites
# ============================================================================
Write-Host "[Step 1/8] Checking prerequisites..." -ForegroundColor Yellow

# Check if Firebase CLI is installed
$firebaseVersion = $null
try {
    $firebaseVersion = firebase --version 2>$null
    Write-Host "  Firebase CLI found: $firebaseVersion" -ForegroundColor Green
} catch {
    Write-Host "  Firebase CLI not found. Installing..." -ForegroundColor Red
    npm install -g firebase-tools
    $firebaseVersion = firebase --version
    Write-Host "  Firebase CLI installed: $firebaseVersion" -ForegroundColor Green
}

# Check if gcloud is installed
$gcloudVersion = $null
try {
    $gcloudVersion = gcloud --version 2>$null | Select-Object -First 1
    Write-Host "  gcloud CLI found: $gcloudVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: gcloud CLI not found. Please install Google Cloud SDK:" -ForegroundColor Red
    Write-Host "  https://cloud.google.com/sdk/docs/install" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ============================================================================
# STEP 2: Authenticate
# ============================================================================
Write-Host "[Step 2/8] Checking authentication..." -ForegroundColor Yellow

# Check gcloud auth
$gcloudAccount = gcloud config get-value account 2>$null
if ($gcloudAccount) {
    Write-Host "  gcloud authenticated as: $gcloudAccount" -ForegroundColor Green
} else {
    Write-Host "  Please authenticate with gcloud..." -ForegroundColor Yellow
    gcloud auth login
}

# Check firebase auth
$firebaseUser = firebase login:list 2>$null | Select-String -Pattern "@"
if ($firebaseUser) {
    Write-Host "  Firebase authenticated" -ForegroundColor Green
} else {
    Write-Host "  Please authenticate with Firebase..." -ForegroundColor Yellow
    firebase login
}

Write-Host ""

# ============================================================================
# STEP 3: Create Google Cloud Project
# ============================================================================
Write-Host "[Step 3/8] Creating Google Cloud project '$PROJECT_ID'..." -ForegroundColor Yellow

# Check if project already exists
$existingProject = gcloud projects describe $PROJECT_ID 2>$null
if ($existingProject) {
    Write-Host "  Project '$PROJECT_ID' already exists. Skipping creation." -ForegroundColor Yellow
} else {
    Write-Host "  Creating project..." -ForegroundColor Cyan
    gcloud projects create $PROJECT_ID --name="$PROJECT_NAME"
    Write-Host "  Project created successfully." -ForegroundColor Green
}

# Set as current project
gcloud config set project $PROJECT_ID
Write-Host "  Set '$PROJECT_ID' as current project." -ForegroundColor Green

Write-Host ""

# ============================================================================
# STEP 4: Enable Required APIs
# ============================================================================
Write-Host "[Step 4/8] Enabling required APIs..." -ForegroundColor Yellow

$apis = @(
    "firebase.googleapis.com",
    "firestore.googleapis.com",
    "firebaserules.googleapis.com",
    "identitytoolkit.googleapis.com",
    "serviceusage.googleapis.com"
)

foreach ($api in $apis) {
    Write-Host "  Enabling $api..." -ForegroundColor Cyan
    gcloud services enable $api --project=$PROJECT_ID 2>$null
}
Write-Host "  All APIs enabled." -ForegroundColor Green

Write-Host ""

# ============================================================================
# STEP 5: Add Firebase to the Project
# ============================================================================
Write-Host "[Step 5/8] Adding Firebase to project..." -ForegroundColor Yellow

# Add Firebase
firebase projects:addfirebase $PROJECT_ID 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Firebase added to project." -ForegroundColor Green
} else {
    Write-Host "  Firebase may already be added or requires manual setup." -ForegroundColor Yellow
    Write-Host "  If this fails, go to: https://console.firebase.google.com/" -ForegroundColor Yellow
    Write-Host "  And add Firebase to project '$PROJECT_ID' manually." -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# STEP 6: Create Firestore Database
# ============================================================================
Write-Host "[Step 6/8] Creating Firestore database in $REGION..." -ForegroundColor Yellow

# Create Firestore database in Native mode
gcloud firestore databases create --project=$PROJECT_ID --location=$REGION --type=firestore-native 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Firestore database created in $REGION." -ForegroundColor Green
} else {
    Write-Host "  Firestore database may already exist." -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# STEP 7: Update Local Config Files
# ============================================================================
Write-Host "[Step 7/8] Updating local configuration files..." -ForegroundColor Yellow

# Navigate to firebase directory
Set-Location $FIREBASE_DIR

# Update .firebaserc
$firebaserc = @{
    projects = @{
        default = $PROJECT_ID
    }
} | ConvertTo-Json -Depth 3

Set-Content -Path ".firebaserc" -Value $firebaserc
Write-Host "  Updated .firebaserc with project '$PROJECT_ID'" -ForegroundColor Green

Write-Host ""

# ============================================================================
# STEP 8: Deploy Firestore Rules and Indexes
# ============================================================================
Write-Host "[Step 8/8] Deploying Firestore rules and indexes..." -ForegroundColor Yellow

Write-Host "  Deploying security rules..." -ForegroundColor Cyan
firebase deploy --only firestore:rules --project $PROJECT_ID

Write-Host "  Deploying indexes (this may take a few minutes to build)..." -ForegroundColor Cyan
firebase deploy --only firestore:indexes --project $PROJECT_ID

Write-Host ""

# ============================================================================
# COMPLETE
# ============================================================================
Write-Host "============================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Project Details:" -ForegroundColor Cyan
Write-Host "  Project ID:     $PROJECT_ID"
Write-Host "  Project Name:   $PROJECT_NAME"
Write-Host "  Region:         $REGION"
Write-Host "  Console URL:    https://console.firebase.google.com/project/$PROJECT_ID"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Verify rules in Firebase Console -> Firestore -> Rules"
Write-Host "  2. Verify indexes in Firebase Console -> Firestore -> Indexes"
Write-Host "  3. Enable Authentication in Firebase Console -> Authentication"
Write-Host "  4. Set admin custom claim (see below)"
Write-Host "  5. Update your app configs to use '$PROJECT_ID' when ready"
Write-Host ""
Write-Host "To set yourself as admin, run:" -ForegroundColor Cyan
Write-Host "  firebase auth:set-custom-user-claims YOUR_EMAIL '{\`"admin\`": true}' --project $PROJECT_ID"
Write-Host ""
