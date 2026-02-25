-- Inbox: recommendations received by the user, with sender name and title info.

CREATE OR REPLACE FUNCTION public.get_recommendations_received(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  from_user_id UUID,
  from_user_display_name TEXT,
  tmdb_id INTEGER,
  type TEXT,
  created_at TIMESTAMPTZ,
  title TEXT,
  original_title TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  overview TEXT,
  release_date DATE,
  first_air_date DATE,
  vote_average DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.from_user_id,
    p.display_name AS from_user_display_name,
    r.tmdb_id,
    r.type,
    r.created_at,
    t.title,
    t.original_title,
    t.poster_path,
    t.backdrop_path,
    t.overview,
    t.release_date,
    t.first_air_date,
    t.vote_average
  FROM public.recommendations r
  JOIN public.profiles p ON p.id = r.from_user_id
  LEFT JOIN public.titles t ON t.tmdb_id = r.tmdb_id AND t.type = r.type
  WHERE r.to_user_id = p_user_id
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_recommendations_received(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recommendations_received(UUID) TO service_role;
