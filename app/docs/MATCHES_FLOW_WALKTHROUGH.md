# How Movies Get Into "Matches" (Likes)

This doc walks through the flow from **user taps like (green heart)** to **movie appears in Matches tab**, and how we ensure **passed (red X) movies never appear**.

---

## 1. Swipe screen: user taps like (green heart)

**File:** `app/(authenticated)/(tabs)/index.tsx`  
**Handler:** `handleSwipeRight()`

1. **Current card:** `title = titles[currentIndex]` — same object used for both swipe and match (e.g. `title.id` = TMDB movie id, `title.type` = `'movie'`).

2. **Save swipe (source of truth):**
   - `swipeHelpers.createSwipe({ user_id, tmdb_id: title.id, type: title.type, decision: 'like' })`
   - Uses **upsert** on `(user_id, tmdb_id, type)` so re-swiping the same movie overwrites (e.g. like → pass).
   - **Table:** `swipes` — one row per (user, tmdb_id, type); `decision` is `'like'` or `'pass'`.

3. **Create match row:**
   - `matchHelpers.createMatch(user.id, title.id, title.type)`
   - Inserts into `matches` with same `(user_id, tmdb_id, type)`.
   - Used for extra data (watched, notes, rating). **Display list is not driven by this table alone.**

**IDs:** `user.id` (UUID), `title.id` (number, TMDB id), `title.type` (`'movie'` from feed). Same values are used for both swipe and match so there is no ID mismatch.

---

## 2. Swipe screen: user taps pass (red X)

**Handler:** `handleSwipeLeft()`

1. **Save swipe:** `createSwipe({ ..., decision: 'pass' })` — upsert overwrites any previous row to `decision = 'pass'`.
2. **Remove match:** `matchHelpers.removeMatch(user.id, title.id, title.type)` — deletes the row from `matches` for that (user, tmdb_id, type).

So after a pass: `swipes` has one row with `decision = 'pass'`; `matches` should have no row for that title (removeMatch + sync keep it that way).

---

## 3. Matches tab: what is shown

**File:** `app/(authenticated)/(tabs)/matches.tsx`  
**Load:** `loadMatches()` → `matchHelpers.syncFromSwipes(user.id)` then `matchHelpers.getMatchesWithTitles(user.id)`.

**Source of truth for the list:** view `matches_with_titles` (migration `20240102000006_matches_from_likes_only.sql`).

- **View definition:** rows come from **`swipes`** where **`decision = 'like'`** only.
- Then LEFT JOIN `matches` (for id, watched, notes, rating) and LEFT JOIN `titles` (for title, poster, etc.).
- So the list is **one row per (user_id, tmdb_id, type) that has a like swipe**. Passed titles never appear because they are not in the set of rows with `decision = 'like'`.

**Why passes were showing before:**  
Older view (or no view fix) was based on **`matches`** only (e.g. `matches LEFT JOIN titles`). If a pass didn’t remove the match row (e.g. removeMatch failed or wasn’t called), that row would still show.  
With the new view, the list is driven by **swipes.decision = 'like'**, so passes cannot show regardless of `matches` state.

---

## 4. Sync: `sync_matches_from_swipes`

**RPC:** `sync_matches_from_swipes(p_user_id)`  
**Runs:** When the Matches tab loads (`loadMatches()`).

1. **DELETE** from `matches` any row for that user that does **not** have a matching **like** swipe (same user_id, tmdb_id, type, decision = 'like').
2. **INSERT** into `matches` a row for each **like** swipe that doesn’t already have a match.

So `matches` is kept in sync with likes: only likes have match rows; passes do not. The **Matches tab list**, however, is defined by the **view** (swipes where like), not by querying `matches` alone.

---

## 5. Summary

| Step | Where | What |
|------|--------|------|
| User taps like | Swipe screen | Upsert swipe (like), insert match (same user_id, tmdb_id, type). |
| User taps pass | Swipe screen | Upsert swipe (pass), delete match for that (user, tmdb_id, type). |
| Matches list | View `matches_with_titles` | Only rows from **swipes** with **decision = 'like'**; join matches + titles. |
| Sync on load | `sync_matches_from_swipes` | Delete matches without a like; insert matches for likes that don’t have one. |

**No ID mismatch:** Same `user.id`, `title.id` (tmdb_id), and `title.type` are used for both `swipes` and `matches`. The fix for “passes showing in Matches” was to **base the list on swipes (like only)** via the new view, so passed titles never appear.
