# Project quality review — 2026-11-19

Fixed functional defects across authentication, profile validation, feed, chat, notifications, and stories. Verification used isolated SQLite databases in memory and the production frontend bundle.

Production follow-up: login was reproduced failing on the deployed website. Its `/api/auth/login` proxy targets the old Render backend and returns HTTP 500, as does `/api/users/recommended`. Render health returns the legacy response without `apiVersion`. The separate Vercel API returns HTTP 503; its runtime logs identify `SequelizeConnectionError` with `SELF_SIGNED_CERT_IN_CHAIN`. Its PostgreSQL environment has no `DATABASE_SSL_CA`. These are live hosting/configuration failures; passing local tests does not resolve them.

The prepared changes route the frontend to the existing Vercel API, preserve same-origin cookies with legacy frontend environment values, and log the failing login stage without logging credentials. A valid Aiven project CA is still needed before configuring TLS and deploying this correction. `scripts/configure-database-ca.cjs` verifies a supplied CA against PostgreSQL before it can update the backend hosting environment. No production routing change has been published during this follow-up.

| Check | Result |
| --- | --- |
| Frontend ESLint, including TypeScript and React Hooks | Passed, no diagnostics |
| Frontend TypeScript check | Passed |
| Backend TypeScript build | Passed |
| Automated backend, network configuration, and model-mapping tests | 95 passed, 0 failed, 0 skipped |
| Frontend production build | Passed |
| Browser visits on desktop and mobile | 38 passed |
| Browser API traffic | 195 requests across 42 routes, no unexpected HTTP or JavaScript errors |
| Local API deployment smoke check | 28 passed |
| Git whitespace check | Passed |

Run the automated checks from the repository root with `npm run ci`. Browser evidence is saved in `dist-test/quality-views-qa.json`; `dist-test` contains local verification artifacts and is ignored by Git.

The fixes include:

- Database-backed, hashed refresh sessions with unique tokens, atomic rotation, replay protection, and logout revocation. Suspended or deleted accounts cannot refresh or use `/auth/me`. Registration rolls back if its session cannot be saved.
- Consistent bearer-token handling and correct separation of authentication errors from database errors. Staff authorization no longer writes a debug file, which could fail on hosted filesystems.
- Validated usernames, normalized email addresses, real calendar birth dates, and adult age bounds. Password changes verify `currentPassword`, revoke refresh sessions, and show success only after the API succeeds.
- Validated feed pagination and notification payloads. Comments on hidden posts return 404. Conversation reads persist message status as well as notification state.
- Correct message enums, timestamps, conversation previews, nullable notification senders, premium fields, and legacy JSON photo/deletion arrays in frontend mappings. Invalid cached user JSON no longer prevents app initialization.
- Account-specific state resets when identity changes, notification polling starts after login, repeated read actions preserve counts, and logout completes before navigation.
- Persistent story creation/listing/deletion, server-controlled 24-hour expiry, author authorization, upload validation, and exclusion of blocked or suspended authors. Story playback follows React Hook ordering; camera cleanup handles late permissions and recording timers.
- TypeScript lint coverage in CI. Frontend TypeScript is pinned to 6.0, which is supported by `typescript-eslint` 8; backend TypeScript remains at 7.

Restart the backend to create the additive `refresh_sessions` and `stories` tables through the existing initialization flow. Existing refresh tokens from the former in-memory implementation require one new login. API clients changing a password must now send `currentPassword` alongside `password`; Swagger documents the updated contract.

Password recovery remains unimplemented: the forgot-password, OTP, and reset-password endpoints return HTTP 501 with an actionable error instead of falsely reporting success. A real mail delivery and recovery flow is still required.

Other existing prototype behavior remains: `/users/nearby` returns a public profile list, while Discover applies distance preferences; calls and several feed menu actions still use placeholder behavior. These features are not covered by a claim of complete implementation.

Live PostgreSQL/MySQL connections, real payment callbacks, and physical camera devices were not exercised. Payment verification and database configuration were covered by the automated suite. These results describe the local changes, not a production deployment or a guarantee that every possible defect has been eliminated.
