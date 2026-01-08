# Database Setup Complete ✅

## What's Been Created

### Database Schema
- ✅ **profiles** - User profiles extending auth.users
- ✅ **streaming_services** - Available streaming platforms (20+ services seeded)
- ✅ **user_streaming_services** - User's subscribed services
- ✅ **genres** - Movie/TV genres (19 genres seeded with TMDB IDs)
- ✅ **user_genre_prefs** - User's genre preferences
- ✅ **titles** - Cache table for TMDB movie/TV data
- ✅ **swipes** - User swipe decisions (like/pass)
- ✅ **matches** - User's liked titles with metadata

### Database Functions
- ✅ `sync_matches_from_swipes()` - Sync matches from liked swipes
- ✅ `get_user_provider_keys()` - Get user's streaming service provider keys
- ✅ `get_user_genre_ids()` - Get user's preferred genre IDs (TMDB)
- ✅ `has_user_swiped()` - Check if user has swiped on a title
- ✅ `get_user_swipe_count()` - Get swipe statistics
- ✅ `upsert_title()` - Insert or update title cache

### Database Views
- ✅ `matches_with_titles` - Matches joined with title data
- ✅ `user_swipe_stats` - User swipe statistics

### Security
- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Policies configured for user data isolation
- ✅ Automatic profile creation on user signup

### TypeScript Support
- ✅ `database.types.ts` - TypeScript types for all tables
- ✅ `db-helpers.ts` - Type-safe helper functions

## Next Steps

### 1. Test the Database
You can test the database using Supabase Studio:
```bash
# Open Supabase Studio
# Visit http://127.0.0.1:54323
```

### 2. Use the Helper Functions
Import and use the helper functions in your app:
```typescript
import { profileHelpers, streamingServiceHelpers, swipeHelpers } from '@/lib/db-helpers';

// Get user profile
const profile = await profileHelpers.getProfile(userId);

// Get all streaming services
const services = await streamingServiceHelpers.getAll();

// Create a swipe
await swipeHelpers.createSwipe({
  user_id: userId,
  tmdb_id: 123,
  type: 'movie',
  decision: 'like'
});
```

### 3. Generate Types (Optional)
For auto-generated types from your actual database:
```bash
supabase gen types typescript --local > app/lib/database.types.ts
```

### 4. Test Database Functions
You can test the database functions in Supabase Studio SQL editor:
```sql
-- Test sync matches
SELECT sync_matches_from_swipes('your-user-id');

-- Get user provider keys
SELECT get_user_provider_keys('your-user-id');

-- Check if user has swiped
SELECT has_user_swiped('your-user-id', 123, 'movie');
```

## Database Structure Summary

```
profiles (1:1 with auth.users)
  ├── user_streaming_services (many-to-many)
  │   └── streaming_services
  ├── user_genre_prefs (many-to-many)
  │   └── genres
  ├── swipes (one-to-many)
  └── matches (one-to-many)
      └── titles (cache, referenced by tmdb_id)
```

## Important Notes

1. **Automatic Profile Creation**: When a user signs up, a profile is automatically created via trigger
2. **RLS Policies**: All user data is protected - users can only access their own data
3. **Provider Keys**: Map to TMDB provider IDs for filtering available content
4. **Genre IDs**: Map to TMDB genre IDs for API queries
5. **Title Caching**: Use `upsert_title()` to cache TMDB data and reduce API calls

## Migration Files

- `20240101000000_initial_schema.sql` - Main schema creation
- `20240101000001_create_matches_view.sql` - Views for easier querying
- `20240101000002_helper_functions.sql` - Database helper functions

## Seed Data

- 20+ streaming services with TMDB provider IDs
- 19 genres with TMDB genre IDs

All seed data is in `seed.sql` and loads automatically on `supabase db reset`.

