# Architecture

Wedding-In has two intentionally distinct execution modes.

## Full-stack local mode

```text
React/Vite UI
    |
    | /api requests, session cookie
    v
Express API (auth, validation, domain routers)
    |
    v
MySQL/MariaDB (versioned migrations)
```

Domain routers live in `server/modules/`. Domain logic and guards are separated from the presentation layer. Operations include independent modules for rundown templates, timeline changes, execution monitoring, vendor payment tracking and project closing.

## Static public demo

```text
React UI -> src/api.ts -> src/demo.ts -> src/demo/*
                                  |
                                  v
                         Browser demo storage
```

The static GitHub Pages site has no Express server or MySQL database. It uses fabricated records and browser-based state to demonstrate user journeys. Browser state is not a reliable shared data store and is unsuitable for production operations.

## Data and financial boundaries

- A wedding organizer contract and a vendor payment made directly by a client are **not** the same revenue/cost flow.
- Monetary rules are tested with integer cents to avoid silent floating-point drift.
- Posted journal lines must balance; cancellation/reversal uses explicit bookkeeping behavior.
- Reusable rundown templates are distinct from wedding-specific editable copies.
- Project closing checks for unfinished operational and financial obligations.

## Source ownership

`src/` contains the React interface. `server/` is the API and business logic. `sql/` captures additive schema migrations. `scripts/` contains local seed and verification utilities. The public demo build is distributed independently of the local API.

