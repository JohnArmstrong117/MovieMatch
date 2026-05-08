# MovieMatch (Meesh)

MovieMatch (app name: **Meesh**) is a mobile app for discovering movies with swipe-style interactions and saving liked titles to a personal matches list.

The app is currently **live on iOS** and **in progress for Google Play (Android)**.

## Overview

- Swipe through movie recommendations (`like` or `pass`)
- Build a personalized matches list from liked titles
- Search TMDB-backed titles and enrich title metadata
- Manage user data with Supabase Auth + Postgres + RLS
- Use Supabase Edge Functions for feed/search/provider workflows

## Tech Stack

- **Client**: React Native + Expo + Expo Router + TypeScript
- **Backend**: Supabase (Auth, Postgres, RLS, RPC, Edge Functions)
- **Data Source**: TMDB (via Supabase Edge Functions)
- **Ads**: `react-native-google-mobile-ads`
- **Testing/Linting**: Jest + ESLint (Expo config)

## Repository Structure

```text
MovieMatch/
  app/                 # Expo mobile app (Meesh)
  supabase/            # Database migrations, seed data, edge functions
  eas.json             # EAS build profiles
```

## Prerequisites

- Node.js 18+ (recommended for Expo/Supabase workflows)
- npm
- Expo CLI (`npx expo ...` works without global install)
- Supabase CLI (for local backend + functions)

## Getting Started (Local Development)

### 1) Install dependencies

From the repository root:

```bash
npm install
cd app
npm install
```

### 2) Configure environment variables

In `app/.env.local`, set:

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_ADMOB_USE_REAL_ADS=false
EXPO_PUBLIC_ADMOB_NATIVE_AD_UNIT_ID_ANDROID=your_android_ad_unit_id
EXPO_PUBLIC_ADMOB_NATIVE_AD_UNIT_ID_IOS=your_ios_ad_unit_id
```

In `supabase/functions/.env`, set:

```bash
TMDB_API_KEY=your_tmdb_api_key
```

### 3) Start Supabase locally

From the repo root:

```bash
supabase start
supabase db reset
```

### 4) Start Edge Functions

In a separate terminal:

```bash
supabase functions serve
```

### 5) Start the Expo app

In another terminal:

```bash
cd app
npm run start
```

Useful scripts (from `app/`):

- `npm run ios`
- `npm run android`
- `npm run lint`
- `npm run test`
- `npm run test:coverage`

## Supabase Notes

- Migrations are stored in `supabase/migrations/`
- Seed data lives in `supabase/seed.sql`
- Edge functions are in `supabase/functions/`
- Keep secrets out of git; use local `.env` files or Supabase project secrets in production

## Deployment Status

- **iOS**: Live
- **Android (Google Play)**: In progress

## Contributing

1. Create a feature branch
2. Make and test your changes
3. Open a pull request with a clear summary and test notes

## License

No license file is currently defined in this repository.
