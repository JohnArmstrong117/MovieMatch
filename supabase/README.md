# MovieMatch Database Schema

This directory contains the database migrations and seed data for the MovieMatch application.

## Schema Overview

The database schema includes:

- **profiles**: User profiles extending auth.users
- **streaming_services**: Available streaming platforms (seed data)
- **user_streaming_services**: User's subscribed streaming services
- **genres**: Movie/TV genres (seed data)
- **user_genre_prefs**: User's genre preferences
- **titles**: Cache table for TMDB movie/TV data
- **swipes**: User swipe decisions (like/pass)
- **matches**: User's liked titles with optional metadata

## Applying Migrations

### First Time Setup

1. Make sure Supabase is running:
   ```bash
   supabase start
   ```

2. Apply migrations:
   ```bash
   supabase db reset
   ```
   This will:
   - Apply all migrations in `migrations/`
   - Run seed data from `seed.sql`
   - Reset the database to a clean state

### Adding New Migrations

1. Create a new migration file:
   ```bash
   supabase migration new your_migration_name
   ```

2. Write your SQL in the generated file

3. Apply the migration:
   ```bash
   supabase db reset
   ```
   Or for production:
   ```bash
   supabase db push
   ```

## Seed Data

The `seed.sql` file contains:
- **Streaming Services**: 20+ popular streaming platforms with TMDB provider IDs
- **Genres**: 19 movie/TV genres with TMDB genre IDs

## Row Level Security (RLS)

All tables have RLS enabled with policies that:
- Allow users to only access their own data
- Make streaming_services and genres publicly readable
- Make titles publicly readable but only authenticated users can write

## Automatic Profile Creation

When a user signs up via Supabase Auth, a profile is automatically created via the `handle_new_user()` trigger function.

## Indexes

Performance indexes are created on:
- Foreign keys
- Frequently queried columns (tmdb_id, user_id, decision, etc.)
- Date columns for sorting/filtering

