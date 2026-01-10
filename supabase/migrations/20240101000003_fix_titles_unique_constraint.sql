-- Fix titles table: tmdb_id should be unique per (tmdb_id, type), not just tmdb_id
-- because movies and TV shows can have the same tmdb_id

-- Drop the old unique constraint
ALTER TABLE public.titles DROP CONSTRAINT IF EXISTS titles_tmdb_id_key;

-- Add a new unique constraint on (tmdb_id, type)
ALTER TABLE public.titles ADD CONSTRAINT titles_tmdb_id_type_key UNIQUE (tmdb_id, type);

-- Also update the upsert_title function to use the new constraint
CREATE OR REPLACE FUNCTION public.upsert_title(
  p_tmdb_id INTEGER,
  p_type TEXT,
  p_title TEXT,
  p_original_title TEXT DEFAULT NULL,
  p_poster_path TEXT DEFAULT NULL,
  p_backdrop_path TEXT DEFAULT NULL,
  p_overview TEXT DEFAULT NULL,
  p_release_date DATE DEFAULT NULL,
  p_first_air_date DATE DEFAULT NULL,
  p_popularity NUMERIC DEFAULT NULL,
  p_vote_average NUMERIC DEFAULT NULL,
  p_vote_count INTEGER DEFAULT NULL,
  p_adult BOOLEAN DEFAULT FALSE,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  title_id UUID;
BEGIN
  INSERT INTO public.titles (
    tmdb_id, type, title, original_title, poster_path, backdrop_path,
    overview, release_date, first_air_date, popularity, vote_average,
    vote_count, adult, metadata
  ) VALUES (
    p_tmdb_id, p_type, p_title, p_original_title, p_poster_path, p_backdrop_path,
    p_overview, p_release_date, p_first_air_date, p_popularity, p_vote_average,
    p_vote_count, p_adult, p_metadata
  )
  ON CONFLICT (tmdb_id, type) DO UPDATE SET
    title = EXCLUDED.title,
    original_title = EXCLUDED.original_title,
    poster_path = EXCLUDED.poster_path,
    backdrop_path = EXCLUDED.backdrop_path,
    overview = EXCLUDED.overview,
    release_date = EXCLUDED.release_date,
    first_air_date = EXCLUDED.first_air_date,
    popularity = EXCLUDED.popularity,
    vote_average = EXCLUDED.vote_average,
    vote_count = EXCLUDED.vote_count,
    adult = EXCLUDED.adult,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO title_id;
  
  RETURN title_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

