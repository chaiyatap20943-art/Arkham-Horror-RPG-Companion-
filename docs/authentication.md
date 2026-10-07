# Google authentication

This build implements real Google OAuth authorization-code sign-in with S256 PKCE. There is no demo account, submitted-email login, browser-selected role, or simulated identity in the application. Test doubles are confined to the test suite.

Google Cloud and Apps Script projects were not supplied. The implementation and local security tests are ready for configuration; an actual Google consent flow and two-account Apps Script deployment have **not** been validated. Follow [the setup guide](setup.md) and complete the deployment checklist below before accepting the authentication milestone.

## Configure a Google web OAuth client

1. Create a Google Cloud project in the [Google Cloud Console](https://console.cloud.google.com/). In **Google Auth Platform**, configure the app branding, audience, and contact details. Select an external audience when personal Google accounts must sign in. During testing, explicitly add both intended test accounts under Audience.
2. Create an OAuth client with application type **Web application**. The server exchanges codes; do not select a desktop client. Request only `openid`, `email`, and `profile`. Users do not authorize access to the database spreadsheet; its installation owner grants the Apps Script runtime that access.
3. Deploy the Apps Script project as a web app, executing as the installation owner. Set web-app access to the audience needed for the test accounts. Keep the database and any parent Drive folders private to the installation owner. Deployment and OAuth consent restrictions must both permit the testers.
4. Copy the exact published web-app URL ending in `/exec`. Register that exact URL as the OAuth client's **Authorized redirect URI**, without a fragment or added callback query. This app's `doGet` receives Google's `state` and `code` parameters at the same URL. A redirect registered for `/dev`, another deployment, or `script.googleusercontent.com` will not match.
5. In the Apps Script project's **Project Settings → Script Properties**, set the following names. Enter secrets directly in the settings; never put their values into the repository, a ticket, or chat.

| Property | Required value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The web OAuth client's ID. |
| `GOOGLE_CLIENT_SECRET` | The web OAuth client's secret. |
| `APP_URL` | The exact published `/exec` URL registered as the redirect. |
| `DATABASE_ID` | The private Google Sheets database ID, required by the application runtime. |

The identity flow does not need a service account, Google refresh token, or user-owned database access. The runtime also needs the manifest's external-request and Sheets permissions; authorize those as the installation owner. Editing Script Properties does not expose them to browser clients. Editors of the Apps Script project remain trusted administrators because they can inspect properties and change server code.

For localhost development, use a **separate web OAuth client** with the exact loopback redirect from `.env.example`, currently `http://localhost:3000/oauth/callback`. Place its ID and secret in the ignored `.env` file, then run `npm run dev`. The Node adapter explicitly uses development mode; production accepts HTTPS redirects only. Without this configuration the preview remains signed out and displays the missing settings.

## Identity and session boundaries

The browser generates a cryptographically random PKCE verifier and sends only its SHA-256 challenge to `beginLogin`. The server records a random, expiring state with that challenge in a private vault. The Google authorization request specifies code flow, S256, the three identity scopes, online access, and account selection.

The callback consumes that state once and records Google's authorization code privately. It returns only an opaque, one-time completion ticket and the correlation state. The ticket contains no identity, authorization code, Google token, or application session. The original app tab polls the server using its state and retained verifier; after the callback arrives, the server validates the verifier and completes sign-in. An observed ticket or state without that verifier cannot complete the request. Production completion therefore does not rely on cross-origin opener messaging. The manual ticket-copy path remains available as a fallback. Any local callback messaging restricts its destination to the configured localhost origin.

After checking and consuming the ticket, the server exchanges the code with `https://oauth2.googleapis.com/token`, sending the client secret and original PKCE verifier. It then calls `https://openidconnect.googleapis.com/v1/userinfo` over verified TLS with Google's returned bearer access token. Identity comes from this server-to-Google exchange: the response must include a subject and an email whose `email_verified` value is exactly `true`. The server never establishes identity by decoding a browser-provided ID token or accepting submitted email, subject, user ID, or role claims.

The immutable Google subject binds the application user record. A changed display name or verified email updates that record without changing the user ID. The application does not return or persist Google's access token, refresh token, or ID token. It issues an independent eight-hour session secret, stores only that secret's SHA-256 digest in the private server vault, and returns the secret to the original tab. Browser storage and popup behavior must be checked in the deployed HTML Service iframe. A shared or compromised browser tab can use its own session, so sign out when leaving a shared device.

Every domain request resolves the session to a user ID and rechecks current campaign membership and permissions. Membership removal therefore takes effect without waiting for the eight-hour session expiry. Logout revokes the submitted application session. It does not sign the person out of Google or revoke their Google OAuth consent, and another independently signed-in app tab can retain its own session.

## Replay, failure, and quota behavior

State and ticket expiry are measured from the start of sign-in: ten minutes total. The callback does not reset that deadline. State is consumed on success, denial, or a malformed callback. A valid completion consumes the ticket before calling Google; if token exchange or profile verification fails, start a new sign-in. An incorrect verifier cannot trigger Google calls or invalidate another tab's still-valid ticket.

Private state, ticket, and session records are protected by the runtime's lock. Google requests and user persistence execute outside the vault lock to avoid a nested ScriptLock. Pending sign-ins are limited to 100 per installation; expired pending and session records are pruned when a new sign-in starts. This limit is global and does not replace broader quota or abuse controls for a public deployment. Apps Script property and execution quotas still apply; measure them in the intended private campaign deployment.

Provider payloads, secrets, codes, and tokens are absent from public error messages. TLS certificate checks remain enabled and the adapters restrict identity requests to the exact Google token and UserInfo endpoints. Failed upstream identity checks cannot create a session.

## Deployment acceptance checklist

Run these checks at the actual published Apps Script URL, including two separate **personal Google accounts**. Local unit tests and a Node preview do not establish Google deployment readiness.

- Sign in with account A and account B independently. Verify the shown emails and stable, distinct user records. Change a display name and confirm the same Google subject retains the same application user ID.
- Test consent denial, a blocked popup, server polling after consent, manual ticket copy into the original tab, page reload during sign-in, ticket replay, and expiry. Confirm production completion uses server polling and that the original verifier remains required.
- Test a wrong redirect configuration and a non-tester account while consent is in testing mode. Correct the configuration and restart sign-in; do not weaken verification.
- Confirm signed-out requests and fabricated browser claims cannot list or mutate campaigns. Create a campaign as A and confirm B sees only their authorized campaigns.
- Invite B by the verified email, confirm account A cannot redeem B's invitation, then join as B. Remove B's membership as A and confirm B's next request is denied using the existing session.
- Sign out and confirm the same session secret is rejected. Confirm an expired session is rejected and no Google token or client secret appears in a public response, browser console, or application logs.
- Confirm database writes succeed using owner execution while neither test account gains raw database or parent-folder sharing.

## Validation and references

`node --test tests/auth.test.cjs` covers forged state and session claims, expiry, denial, single-use state and tickets, verifier mismatch, the standard RFC 7636 challenge, upstream failure, unverified email rejection, subject-based identity, digest-only sessions, logout, the pending-login limit, and verifier-bound server polling. The tests replace Google transport and persistence with explicit test doubles; they make no claim that Google or Apps Script runtime integration was exercised.

Official references:

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): scopes, token exchange, UserInfo, and subject identity.
- [OAuth 2.0 for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server): web clients, registered redirects, and server-side code exchange.
- [Google-maintained OAuth2Client source](https://github.com/googleapis/google-cloud-node-core/blob/main/packages/google-auth-library-nodejs/src/auth/oauth2client.ts): the current supported client's S256 challenge and `code_verifier` parameters. This source was checked during implementation on 2026-10-07 because the Google developer documentation site was inaccessible from the build environment.
- [Apps Script web apps](https://developers.google.com/apps-script/guides/web): deployment and execution identity.
- [Apps Script HTML Service restrictions](https://developers.google.com/apps-script/guides/html/restrictions): iframe sandbox and navigation restrictions.
- [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636): PKCE verifier and S256 challenge construction.
