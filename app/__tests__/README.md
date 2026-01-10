# Swipe and Match System Tests

This directory contains integration tests for the swiping and match system.

## Prerequisites

1. **Supabase must be running locally**:
   ```bash
   supabase start
   ```

2. **Database must be reset** (fresh state):
   ```bash
   supabase db reset
   ```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Overview

The `swipe-and-match.test.ts` file simulates a complete user swipe-through experience:

1. **Creates a test user** - Fresh user for each test run (automatically cleaned up)
2. **Caches all titles** - Simulates title caching that happens during swiping using `upsert_title` function
3. **Swipes through all test data** - Simulates swiping on all available titles (8 total: 5 movies + 3 TV shows)
4. **Verifies matches** - Ensures:
   - All liked titles appear in matches
   - No passed titles appear in matches
   - Match data is correct (title, overview, poster, ratings, etc.)
   - Type-specific fields are correct (release_date for movies, first_air_date for TV)
   - Matches sync correctly from swipes
   - Duplicate swipes are prevented
   - Multiple syncs don't create duplicates

## Test Data

The tests use all titles from `mock-tmdb.ts`:

**Movies (5):**
- Fight Club (550) - LIKE
- Forrest Gump (13) - PASS
- The Shawshank Redemption (278) - LIKE
- The Godfather (238) - LIKE
- Schindler's List (424) - PASS

**TV Shows (3):**
- Breaking Bad (1396) - LIKE
- Game of Thrones (1399) - PASS
- Friends (1668) - LIKE

**Expected Results:**
- 5 likes → 5 matches
- 3 passes → 0 matches (should not appear)

## What Gets Tested

✅ Swipes are created correctly  
✅ Titles are cached properly  
✅ Matches are synced from swipes  
✅ Only likes appear in matches  
✅ Passes do NOT appear in matches  
✅ Match data is complete and correct  
✅ Type-specific fields are handled correctly  
✅ Duplicate swipes are prevented  
✅ Multiple syncs don't create duplicates  

## Troubleshooting

If tests fail:

1. **Check Supabase is running**: `supabase status`
2. **Reset the database**: `supabase db reset`
3. **Check your Supabase URL** in `lib/supabase.ts` matches your local instance
4. **Ensure seed data exists**: The migrations should have seeded streaming services and genres

