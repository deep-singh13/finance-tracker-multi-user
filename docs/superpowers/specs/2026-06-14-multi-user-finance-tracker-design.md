# Multi-user Finance Tracker — Design

**Date:** 2026-06-14
**Status:** Approved (pending implementation)

## Summary

Fork the existing single-user finance tracker into a multi-user application
deployed to a new repository against a fresh Neon database. Add real user
accounts (username + password), per-user data isolation, and an admin panel.
Remove the Gmail import feature and the Scriptable widget worker entirely.

## Current State (what we fork from)

- Single-user app. Auth is a single 4-digit PIN (`AUTH_PIN_HASH` env var); no
  users table.
- Session-based auth via `express-session` + in-memory `memorystore`.
- Data tables (`expenses`, `income`, `budgets`, `investments`,
  `subscriptions`, `gmail_sync`) have **no** user scoping — every query is
  global.
- Stack: React + Vite client, Express server, Drizzle ORM, Neon Postgres.
- Extra components removed in the fork: Gmail OAuth import (`server/gmail.ts`,
  `gmail_sync` table, sync UI) and `widget-worker/` (Scriptable iOS widget).

## Goals

1. Multiple users, each with a unique username and password, fully isolated
   financial data.
2. An admin role with a management panel (list/create/delete users, reset
   passwords, promote/demote, view per-user stats).
3. Clean fork ready to push to a new repo + new Neon DB.

## Non-Goals

- Gmail import (removed).
- Scriptable widget worker (removed).
- Password reset via email, email verification, OAuth/social login, 2FA.
- Cross-user sharing of any financial data.

## Approach

Keep the existing stack and architecture. The change is **adding a user
dimension**, not a rewrite:

1. Add a `users` table.
2. Add a `userId` FK to every data table; scope every storage query by it.
3. Replace PIN auth with username/password (bcrypt) + a `role` column.
4. Add admin routes + an admin panel UI.

Rejected alternatives: a separate JWT auth service (overkill for self-hosted;
sessions already work) and Postgres row-level security (more moving parts than
scoping in the storage layer).

## Data Model

```
users
  id          serial PK
  username    text unique not null
  passwordHash text not null
  role        text not null default 'user'   -- 'user' | 'admin'
  createdAt   timestamp default now()
  lastLoginAt timestamp

expenses / income / budgets / investments / subscriptions
  + userId    integer not null references users(id) on delete cascade, indexed

budgets: unique constraint changes from (month) to (userId, month)
gmail_sync: table REMOVED
```

Fresh schema on the new Neon DB — no data migration of existing rows.

## Auth & Routing

- `POST /api/auth/register`
  - Allowed when **zero users exist** → creates the first user as **admin**.
  - Allowed when the caller is a logged-in **admin** → creates a normal user
    (the invite mechanism).
  - Otherwise `403`.
- `POST /api/auth/login` — verify username + bcrypt password, regenerate
  session, set `userId` + `role`, update `lastLoginAt`.
- `POST /api/auth/logout`, `GET /api/auth/me` (returns `{ username, role }`).
- `requireAuth` middleware → attaches `userId` and `role` to the request; all
  data routes scope by `userId`.
- `requireAdmin` middleware → gates admin routes.
- Keep the login rate limiter. Enforce a minimum password length on
  register/reset. Passwords stored as bcrypt hashes only.
- **Sessions:** switch from in-memory `memorystore` to Postgres-backed
  `connect-pg-simple` so sessions survive restarts and scale beyond one
  process.

### Registration flow

The public `/register` page is shown only while no users exist (bootstrap of
the first admin). Once any user exists, `/register` redirects to `/login` and
the API rejects unauthenticated registration. All subsequent accounts are
created by an admin from the admin panel.

## Admin Features (`/admin`, admin-only)

- List all users: username, role, createdAt, lastLoginAt, and per-user
  transaction counts.
- Create a user (username + initial password).
- Delete a user — cascades to delete all their financial data. An admin
  cannot delete their own account.
- Reset a user's password.
- Promote / demote admin role. The system must always retain at least one
  admin (cannot demote or delete the last admin).

## Client

- New `/login` and `/register` pages.
- New `/admin` page, rendered only for `role === 'admin'`.
- A user menu in the existing app shell: current username + logout.
- Existing finance screens unchanged in behavior; they now show only the
  logged-in user's data.

## Testing

- Storage-layer isolation tests: user A cannot read or write user B's rows
  across all tables.
- Auth tests: first user becomes admin; registration closes after the first
  user; admin-only routes reject normal users; cannot delete or demote the
  last admin; login rate limiting works.

## Deployment (pending user inputs)

Build in the current working copy, then prepare as a fresh repo. Before
pushing, the user provides:

- The new GitHub repository URL (set as `origin`).
- The new Neon connection string → `.env` as `DATABASE_URL` (never committed;
  `.env` stays gitignored).

The first admin is created by visiting `/register` on the freshly deployed
app while the users table is empty.
