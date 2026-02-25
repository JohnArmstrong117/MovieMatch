-- Add genre_ids to get_liked_matches_with_titles so matches can be filtered by genre client-side.
-- genre_ids come from titles.metadata->'genre_ids' (TMDB genre IDs).
-- Drop first because PostgreSQL does not allow changing return type with CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.get_liked_matches_with_titles(UUID);

CREATE FUNCTION public.get_liked_matches_with_titles(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  tmdb_id INTEGER,
  type TEXT,
  watched BOOLEAN,
  notes TEXT,
  rating INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  title TEXT,
  original_title TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  overview TEXT,
  release_date DATE,
  first_air_date DATE,
  popularity DOUBLE PRECISION,
  vote_average DOUBLE PRECISION,
  vote_count INTEGER,
  genre_ids JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    s.user_id,
    s.tmdb_id,
    s.type,
    COALESCE(m.watched, false) AS watched,
    m.notes,
    m.rating,
    s.created_at,
    m.updated_at,
    t.title,
    t.original_title,
    t.poster_path,
    t.backdrop_path,
    t.overview,
    t.release_date,
    t.first_air_date,
    t.popularity,
    t.vote_average,
    t.vote_count,
    COALESCE(t.metadata->'genre_ids', '[]'::jsonb) AS genre_ids
  FROM public.swipes s
  LEFT JOIN public.matches m
    ON m.user_id = s.user_id AND m.tmdb_id = s.tmdb_id AND m.type = s.type
  LEFT JOIN public.titles t
    ON t.tmdb_id = s.tmdb_id AND t.type = s.type
  WHERE s.user_id = p_user_id
    AND s.decision = 'like'
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_liked_matches_with_titles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_liked_matches_with_titles(UUID) TO service_role;
