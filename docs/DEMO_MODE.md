# Demo mode, local database and security

## Public GitHub Pages demo

- URL: https://febriantrip.github.io/wedding-in/
- The build uses `VITE_PUBLIC_DEMO=true` and a `/wedding-in/` Vite base path.
- Sample clients, vendors, prices, tasks and financial records are illustrative.
- Data changes stay within the browser's demo state and can be reset by clearing that site's storage.
- Authentication, passkey enrollment and multi-user database behavior are **not** reproduced by the static demo.

## Full-stack local mode

- Copy `.env.example` to `.env`; keep the resulting `.env` private.
- Configure a separate database user, host, port and schema.
- Generate a new random JWT secret of at least 32 characters.
- Set an owner email and a strong password before running `npm run db:seed`.
- Run migrations (`npm run db:migrate`) only against the intended local database. Schema changes are additive, but backups and review are still recommended.
- For WebAuthn/passkeys, configure `PASSKEY_ORIGIN` and `PASSKEY_RP_ID` to the actual HTTPS host or local development origin.

## Not suitable for public deployment without review

This repository is provided as a portfolio codebase. Before using real clients or financial records, independently assess authentication/session policy, roles, API access control, rate limits, request logging, database backups, secret rotation, privacy, testing, and deployment hardening.

