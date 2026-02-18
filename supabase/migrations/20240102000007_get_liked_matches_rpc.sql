-- Single source of truth for "matches" list: only titles the user LIKED (heart).
-- This RPC runs the same logic as matches_with_titles but with an explicit
-- filter in the function so we never accidentally show passes.
-- Use this from the app instead of querying the view.

CREATE OR REPLACE FUNCTION public.get_liked_matches_with_titles(p_user_id UUID)
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
  vote_count INTEGER
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
    t.vote_count
  FROM public.swipes s
  LEFT JOIN public.matches m
    ON m.user_id = s.user_id AND m.tmdb_id = s.tmdb_id AND m.type = s.type
  LEFT JOIN public.titles t
    ON t.tmdb_id = s.tmdb_id AND t.type = s.type
  WHERE s.user_id = p_user_id
    AND s.decision = 'like'
  ORDER BY s.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_liked_matches_with_titles(UUID) IS
  'Returns one row per LIKED title (swipes.decision=like) for the user. Passes never included.';

GRANT EXECUTE ON FUNCTION public.get_liked_matches_with_titles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_liked_matches_with_titles(UUID) TO service_role;
