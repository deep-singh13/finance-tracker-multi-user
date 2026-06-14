# sync-gmail

Fetch HDFC Bank transaction emails from Gmail and push them to the finance tracker's staging area for review.

## Steps

### 1 — Read configuration
The app URL and optional API key come from environment variables. Read them now:
- `FINANCE_TRACKER_URL` — base URL of the deployed app (e.g. `https://finance-tracker.onrender.com`). If not set, use `http://localhost:5000`.
- `SYNC_API_KEY` — optional; if set, include it as the `X-Sync-Key` request header.

### 2 — Get last sync date
Call `GET $FINANCE_TRACKER_URL/api/gmail/status`. Parse `lastSyncedAt` from the JSON response.
- If `lastSyncedAt` is set, use it to build an `after:YYYY/MM/DD` Gmail query clause.
- If null, default to `newer_than:90d`.

### 3 — Search Gmail for transaction emails
Use the Gmail MCP `search_threads` tool with **two separate queries** (adjust the `after:` date from step 2):

**Query A — debits & UPI:**
```
from:alerts@hdfcbank.bank.in (debited OR "UPI txn") $AFTER_CLAUSE
```

**Query B — ATM / cash withdrawals** (different email format, not caught by query A):
```
from:alerts@hdfcbank.bank.in "ATM withdrawal" $AFTER_CLAUSE
```

Run both queries. Deduplicate by thread ID. Call `get_thread` on every unique thread (HDFC bundles alerts into mega-threads; `search_threads` silently truncates them). Fetch up to 50 threads per query.

### 4 — Parse each message into a transaction

For every message, determine its type first, then extract fields.

**Detect ATM withdrawal** — snippet contains `ATM withdrawal` or `for ATM`:
- **Amount** — match `Rs <digits>` (space after Rs, not dot) or `Rs.<digits>`, strip commas, multiply by 100 → paise
  - `Rs 10000.00` → 1000000 paise
- **Description** — always `"Cash Withdrawal"`
- **Category** — always `Miscellaneous`
- **Date** — message `date` field → `YYYY-MM-DD`
- **externalId** — message `id`

**All other debits** — extract from snippet:

**Amount** — match `Rs.<digits>` or `INR <digits>` (strip commas, multiply by 100 to get paise):
- `Rs.353.58` → 35358 paise
- `Rs.1,180.00` → 118000 paise

**Merchant / Description** — use these rules in order:
1. UPI pattern: `to VPA <vpa_address> <MERCHANT NAME> on` — capture MERCHANT NAME
   - Example snippet: `debited from account 1366 to VPA payzomato@hdfcbank ZOMATO on 14-04-26` → `ZOMATO`
2. Debit card pattern: `at <MERCHANT NAME> on <date>` or `at <MERCHANT NAME> at`
   - Example: `debited from your HDFC Bank Debit Card ending 3482 at CLAUDE.AI SUBSCRIPTION on` → `CLAUDE.AI SUBSCRIPTION`
3. Fallback: use the email subject, trimmed.

Capitalise the merchant name in title case (e.g. `ZOMATO` → `Zomato`, `COSMO PROFILE SALONS` → `Cosmo Profile Salons`).

**Category** — map to one of exactly these 4 values (case-sensitive): `Food`, `Entertainment`, `Amenities`, `Miscellaneous`

Use these keyword rules (case-insensitive on the merchant name):
- **Food**: swiggy, zomato, blinkit, mcdonald, pizza, domino, restaurant, cafe, food, biryani, burger, kfc, starbucks
- **Entertainment**: netflix, hotstar, spotify, bookmyshow, prime video, apple services, youtube, disney, movie, game
- **Amenities**: jio, airtel, bsnl, internet, broadband, electricity, gas, recharge, dth, water, bill, hospital, clinic, doctor, pharmacy, medical, apollo, medplus, gym, salon, ola, uber, rapido, metro, petrol, fuel, parking
- **Miscellaneous**: everything else (amazon, flipkart, shopping, hotel, flight, irctc, etc.)

**Date** — use the message's `date` field (ISO 8601), convert to `YYYY-MM-DD`.

**externalId** — use the message's `id` field from the search result.

**Skip** a message if:
- Amount cannot be parsed (no Rs./INR amount found)
- The snippet contains `credited` but NOT `debited` (refunds/incoming, skip these)
- Subject contains `OTP` (one-time password emails, not transactions)

### 5 — POST to the staging API

Batch all parsed transactions in a single request to the **staging** endpoint (not sync):

```
POST $FINANCE_TRACKER_URL/api/gmail/stage
Content-Type: application/json
X-Sync-Key: $SYNC_API_KEY   ← only if SYNC_API_KEY is set

{
  "transactions": [
    { "amount": 35358, "description": "Zomato", "category": "Food", "date": "2026-04-14", "externalId": "19d8a285d3b1bd18" },
    ...
  ]
}
```

The server will automatically filter out transactions already in the database.

### 6 — Report results

Print a summary like:
```
✅ Gmail sync staged for review
   Fetched : 42 emails
   Staged  : 12 new transactions (ready to review in the app)
   Skipped : 30 (already in DB or duplicates)

Open the finance tracker and click "Sync Gmail" to review and approve.
```

If the request fails, show the error message from the response body.
