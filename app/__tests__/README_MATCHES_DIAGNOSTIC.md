# Matches Invariant: How to Run and View Results

**Invariant:** A user's Matches must contain **only** movies they said **YES (like)** to. There should never be data in Matches for a movie they said **NO (pass)** to.

---

## 1. Run the invariant test (Jest)

This test simulates the exact app flow (upsert swipe like → createMatch → upsert swipe pass → removeMatch) and asserts the invariant.

**Prerequisites:** Supabase running locally (`supabase start`).

```bash
cd app
npm run test:matches-invariant
```

**View results:**

- **Console:** Pass/fail and test output.
- **Report file:** `app/test-results/matches-invariant-report.txt`  
  Contains: swipes, matches table, and `matches_with_titles` view for the test user so you can see exactly what’s in the DB.

If the test **fails**, the report shows the state of `swipes`, `matches`, and the view so you can see where the invariant is broken.

---

## 2. Scan your real DB for violations

Use this when you’re seeing wrong data in the app and want to find which users/rows violate the invariant.

**Prerequisites:** Service role key (bypasses RLS so we can read all swipes/matches).

1. Get your local Supabase service role key:
   ```bash
   supabase status
   ```
   Copy the `service_role key` (not the anon key).

2. Run the diagnostic (from repo root or `app`):
   ```bash
   cd app
   set EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   set SUPABASE_SERVICE_ROLE_KEY=<paste-service-role-key>
   npm run diagnose:matches
   ```
   On macOS/Linux use `export` instead of `set`.

**View results:**

- **Console:** Summary and each violation (user id, match vs pass, etc.).
- **Report file:** `app/test-results/matches-diagnostic-<timestamp>.txt`  
  Same content; use it to share or inspect later.

**What it reports:**

- **MATCH_WITH_PASS:** A row in `matches` exists for a (user, tmdb_id, type) where the user’s swipe is **pass**. (Bug: that movie should not be in Matches.)
- **MATCH_WITHOUT_LIKE:** A row in `matches` has no corresponding **like** swipe. (Stale or bug.)
- **LIKE_WITHOUT_MATCH:** User has a **like** swipe but no match row. (Sync/createMatch issue; display might still work if the view is like-based.)

Fixing the logic and re-running these will confirm when the invariant holds.
