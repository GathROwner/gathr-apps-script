# GathR authentication email experience

The production Firebase project is `gathr-m1`. Its account-action callback is hosted at:

`https://gathr-m1.web.app/auth/action`

## Versioned sources

- Hosted account page: `functions/hosting/public/auth/action/`
- Verification email body: `functions/config/auth-email/verify-email.html`
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

Hosting deployment does not update the Firebase Authentication callback or email template. Those are separate Identity Platform configuration fields:

- `notification.sendEmail.callbackUri`
- `notification.sendEmail.verifyEmailTemplate`
- `authorizedDomains`

Before changing those fields, capture their current values and use a narrow REST `updateMask`. Do not replace the complete Identity Platform config.

## Required verification

1. Confirm the Hosting dry run names only `hosting`.
2. Load an invalid code and confirm the polished expired/already-used state.
3. Create an isolated unverified test account, generate a verification action code without sending mail, load it through the hosted page, and confirm `emailVerified: true`.
4. Delete the test account and confirm the deletion response.
5. Confirm the action route sends `Cache-Control: no-store`, a restrictive Content Security Policy, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.
6. Send one real verification email and inspect the rendered email plus the final callback on a phone.
