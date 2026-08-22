# GathR authentication email experience

The production Firebase project is `gathr-m1`. Its account-action callback is hosted at:

`https://gathr-m1.web.app/auth/action`

## Versioned sources

- Hosted account page: `functions/hosting/public/auth/action/`
- Production verification email and fixed mail copy: `functions/src/services/brandedVerificationEmail.ts`
- Visual reference for the same email: `functions/config/auth-email/verify-email.html`
- Authenticated delivery endpoint and server rate limit: `functions/src/triggers/accountVerification.ts`
- Official globe/wordmark asset: `https://www.gathrapp.ca/assets/logos/icon.png` (the same artwork is versioned in the app as `assets/icon3.png`)
- Firebase Hosting configuration and security headers: `functions/firebase.json`
- Mobile verification request and return URL: `lib/accountVerification.ts` in the SDK54 app repository

The hosted page supports all Firebase callback modes currently used by GathR:

- `verifyEmail`
- `resetPassword`
- `recoverEmail`

The page accepts return URLs only for the `gathr:` scheme or these HTTPS hosts: `gathrapp.ca`, `www.gathrapp.ca`, and `link.gathrapp.ca`. Any other value falls back to the GathR app landing URL.

## Deployment boundary

Run Hosting commands from `functions/` and always name the production project explicitly:

```powershell
firebase deploy --only hosting --project gathr-m1 --dry-run --non-interactive
firebase deploy --only hosting --project gathr-m1 --non-interactive
```

Firebase's built-in notification-template API currently rejects both template and callback updates with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. GathR therefore does not call the client SDK's built-in `sendEmailVerification` method. The app calls `sendBrandedEmailVerification`, which:

- verifies the caller's Firebase ID token;
- reads the destination email from Firebase Auth rather than request input;
- enforces a one-minute minimum interval and five sends per rolling hour;
- generates a one-time Admin SDK verification code;
- rewrites only the action-handler origin/path to the branded Hosting page while preserving Firebase's action parameters; and
- sends fixed HTML and plain-text bodies with the official GathR globe.

The endpoint uses the `BRANDED_EMAIL_USER` and `BRANDED_EMAIL_PASSWORD` Secret Manager values. Deploy it separately from the parser functions:

```powershell
firebase deploy --only functions:sendBrandedEmailVerification --project gathr-m1 --non-interactive
```

The Hosting action page still supports Firebase's built-in password-reset and recover-email links. `authorizedDomains` remains managed as a narrow Identity Platform configuration field.

## Required verification

1. Confirm the Hosting dry run names only `hosting`.
2. Load an invalid code and confirm the polished expired/already-used state.
3. Create an isolated unverified test account, generate a verification action code without sending mail, load it through the hosted page, and confirm `emailVerified: true`.
4. Delete the test account and confirm the deletion response.
5. Confirm the action route sends `Cache-Control: no-store`, a restrictive Content Security Policy, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.
6. Confirm unauthenticated endpoint requests return `401` and do not create a mail reservation.
7. Send one real verification email and inspect the rendered email plus the final callback on a phone.
8. Immediately retry and confirm the server returns `429` without another email.
