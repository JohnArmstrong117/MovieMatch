-- Enable UUID extension (optional; we use gen_random_uuid() for portability on Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- Create profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  country_code TEXT, -- ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB')
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create streaming_services table (seed data)
CREATE TABLE public.streaming_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  provider_key TEXT NOT NULL UNIQUE, -- TMDB provider ID or external API ID
  logo_url TEXT, -- Optional: URL to service logo
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_streaming_services junction table
CREATE TABLE public.user_streaming_services (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.streaming_services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, service_id),
  UNIQUE (user_id, service_id)
);

-- Create genres table (seed data)
CREATE TABLE public.genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  external_id INTEGER NOT NULL UNIQUE, -- TMDB genre ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_genre_prefs junction table
CREATE TABLE public.user_genre_prefs (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  genre_id UUID NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, genre_id),
  UNIQUE (user_id, genre_id)
);

-- Create titles cache table (optional but recommended)
CREATE TABLE public.titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INTEGER NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  original_title TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  overview TEXT,
  release_date DATE, -- For movies
  first_air_date DATE, -- For TV shows
  popularity NUMERIC,
  vote_average NUMERIC,
  vote_count INTEGER,
  adult BOOLEAN DEFAULT FALSE,
  -- JSONB for flexible additional data
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create swipes table
CREATE TABLE public.swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  decision TEXT NOT NULL CHECK (decision IN ('like', 'pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tmdb_id, type) -- Prevents duplicate swipes
);

-- Create matches table (for liked items with optional metadata)
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  watched BOOLEAN DEFAULT FALSE,
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5), -- Optional 1-5 star rating
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tmdb_id, type)
);

-- Create indexes for performance
CREATE INDEX idx_profiles_country_code ON public.profiles(country_code);
CREATE INDEX idx_user_streaming_services_user_id ON public.user_streaming_services(user_id);
CREATE INDEX idx_user_streaming_services_service_id ON public.user_streaming_services(service_id);
CREATE INDEX idx_user_genre_prefs_user_id ON public.user_genre_prefs(user_id);
CREATE INDEX idx_user_genre_prefs_genre_id ON public.user_genre_prefs(genre_id);
CREATE INDEX idx_titles_tmdb_id ON public.titles(tmdb_id);
CREATE INDEX idx_titles_type ON public.titles(type);
CREATE INDEX idx_titles_release_date ON public.titles(release_date);
CREATE INDEX idx_swipes_user_id ON public.swipes(user_id);
CREATE INDEX idx_swipes_tmdb_id ON public.swipes(tmdb_id);
CREATE INDEX idx_swipes_decision ON public.swipes(decision);
CREATE INDEX idx_swipes_created_at ON public.swipes(created_at);
CREATE INDEX idx_matches_user_id ON public.matches(user_id);
CREATE INDEX idx_matches_tmdb_id ON public.matches(tmdb_id);
CREATE INDEX idx_matches_watched ON public.matches(watched);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_titles
  BEFORE UPDATE ON public.titles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_matches
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaming_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_genre_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for user_streaming_services
CREATE POLICY "Users can view their own streaming services"
  ON public.user_streaming_services FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own streaming services"
  ON public.user_streaming_services FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for user_genre_prefs
CREATE POLICY "Users can view their own genre preferences"
  ON public.user_genre_prefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own genre preferences"
  ON public.user_genre_prefs FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for titles (public read, authenticated write)
CREATE POLICY "Anyone can view titles"
  ON public.titles FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert titles"
  ON public.titles FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update titles"
  ON public.titles FOR UPDATE
  USING (auth.role() = 'authenticated');

-- RLS Policies for swipes
CREATE POLICY "Users can view their own swipes"
  ON public.swipes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own swipes"
  ON public.swipes FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for matches
CREATE POLICY "Users can view their own matches"
  ON public.matches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own matches"
  ON public.matches FOR ALL
  USING (auth.uid() = user_id);

-- Streaming services and genres are public read
ALTER TABLE public.streaming_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view streaming services"
  ON public.streaming_services FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view genres"
  ON public.genres FOR SELECT
  USING (true);

-- Create function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

