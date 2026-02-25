-- Optional p_type filter for get_liked_matches_with_titles (movie | tv | null = all).

DROP FUNCTION IF EXISTS public.get_liked_matches_with_titles(UUID);

CREATE FUNCTION public.get_liked_matches_with_titles(p_user_id UUID, p_type TEXT DEFAULT NULL)
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
    AND (p_type IS NULL OR s.type = p_type)
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_liked_matches_with_titles(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_liked_matches_with_titles(UUID, TEXT) TO service_role;
