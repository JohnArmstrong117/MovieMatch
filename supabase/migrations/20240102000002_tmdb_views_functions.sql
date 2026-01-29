-- TMDB Tables and Views Migration
-- Creates tables for TMDB genres and providers, replacing the old schema structure

-- Create TMDB genres table for movies
CREATE TABLE IF NOT EXISTS public.tmdb_genres_movie (
  genre_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_genres junction table (links users to TMDB genre IDs)
CREATE TABLE IF NOT EXISTS public.user_genres (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES public.tmdb_genres_movie(genre_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, genre_id)
);

-- Create TMDB providers table for movies
CREATE TABLE IF NOT EXISTS public.tmdb_providers_movie (
  provider_id INTEGER PRIMARY KEY,
  provider_name TEXT NOT NULL,
  logo_path TEXT,
  display_priority INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_providers junction table (links users to TMDB provider IDs)
CREATE TABLE IF NOT EXISTS public.user_providers (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES public.tmdb_providers_movie(provider_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, provider_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_genres_user_id ON public.user_genres(user_id);
CREATE INDEX IF NOT EXISTS idx_user_genres_genre_id ON public.user_genres(genre_id);
CREATE INDEX IF NOT EXISTS idx_user_providers_user_id ON public.user_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_providers_provider_id ON public.user_providers(provider_id);

-- Enable RLS
ALTER TABLE public.tmdb_genres_movie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmdb_providers_movie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_providers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tmdb_genres_movie (public read, no write)
DROP POLICY IF EXISTS "Anyone can read TMDB genres" ON public.tmdb_genres_movie;
CREATE POLICY "Anyone can read TMDB genres"
  ON public.tmdb_genres_movie FOR SELECT
  USING (true);

-- RLS Policies for user_genres
DROP POLICY IF EXISTS "Users can view their own genre preferences" ON public.user_genres;
CREATE POLICY "Users can view their own genre preferences"
  ON public.user_genres FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own genre preferences" ON public.user_genres;
CREATE POLICY "Users can manage their own genre preferences"
  ON public.user_genres FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for tmdb_providers_movie (public read, no write)
DROP POLICY IF EXISTS "Anyone can read TMDB providers" ON public.tmdb_providers_movie;
CREATE POLICY "Anyone can read TMDB providers"
  ON public.tmdb_providers_movie FOR SELECT
  USING (true);

-- RLS Policies for user_providers
DROP POLICY IF EXISTS "Users can view their own provider preferences" ON public.user_providers;
CREATE POLICY "Users can view their own provider preferences"
  ON public.user_providers FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own provider preferences" ON public.user_providers;
CREATE POLICY "Users can manage their own provider preferences"
  ON public.user_providers FOR ALL
  USING (auth.uid() = user_id);

-- Insert common TMDB movie genres (from TMDB API)
INSERT INTO public.tmdb_genres_movie (genre_id, name) VALUES
  (28, 'Action'),
  (12, 'Adventure'),
  (16, 'Animation'),
  (35, 'Comedy'),
  (80, 'Crime'),
  (99, 'Documentary'),
  (18, 'Drama'),
  (10751, 'Family'),
  (14, 'Fantasy'),
  (36, 'History'),
  (27, 'Horror'),
  (10402, 'Music'),
  (9648, 'Mystery'),
  (10749, 'Romance'),
  (878, 'Science Fiction'),
  (10770, 'TV Movie'),
  (53, 'Thriller'),
  (10752, 'War'),
  (37, 'Western')
ON CONFLICT (genre_id) DO NOTHING;

-- Note: TMDB providers will be populated by a separate script or API call
-- Common providers can be added here if needed
