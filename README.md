# Finance Tracker (multi-user)

A self-hosted personal finance tracker — expenses, income, investments, budgets,
and subscriptions — now with **multiple user accounts** and an **admin panel**.
Each user has a private, fully isolated set of financial data.

This is a fork of the original single-user finance tracker. Gmail import and the
Scriptable widget worker have been removed.

## Accounts & roles

- **First run:** visit the app with an empty database and the login screen shows
  "Create the first (admin) account". The first registered user becomes the
  **admin**. Public sign-up then closes automatically.
- **Adding users:** afterwards, only an admin can create accounts, from the
  **Admin** tab. Each user logs in with their own username + password.
- **Admin panel:** list users (with per-user transaction counts and last login),
  create users, reset passwords, promote/demote admins, and delete users
  (which cascades to all of that user's data). The system always keeps at least
  one admin, and an admin cannot delete their own account.

## Tech

React + Vite, Express, Drizzle ORM, Postgres (Neon). Sessions are stored in
Postgres via `connect-pg-simple`. Passwords are hashed with bcrypt.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` (a Neon connection
   string) and `SESSION_SECRET`.
3. Create the schema: `npm run db:push`
4. Dev: `npm run dev` — then open the app and create the first admin account.

## Deploy (Render)

Set `DATABASE_URL` and `SESSION_SECRET` as environment variables in the Render
dashboard (never commit them). Build with `npm run build`, start with
`npm start`. Run `npm run db:push` once against the production database (locally
with `DATABASE_URL` pointed at it, or from a one-off Render shell).

## Tests

The suite runs against a real Postgres. Set `TEST_DATABASE_URL` to an empty
database (a Neon branch or a local container), then:

```
TEST_DATABASE_URL=postgres://... DATABASE_URL=postgres://... npm test
```

Coverage includes per-user data isolation, the auth/registration gate, and the
admin user-management routes.
