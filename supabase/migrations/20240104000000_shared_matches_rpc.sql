-- Shared matches: titles that appear in both the user's and a friend's matches (likes).
-- Only allowed when the two users are accepted friends.
-- Returns same shape as get_liked_matches_with_titles for the current user's rows (so UI can reuse).

CREATE OR REPLACE FUNCTION public.get_shared_matches_with_friend(p_user_id UUID, p_friend_id UUID)
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
  FROM (
    SELECT su.tmdb_id, su.type
    FROM public.swipes su
    INNER JOIN public.swipes sf
      ON su.tmdb_id = sf.tmdb_id AND su.type = sf.type
    WHERE su.user_id = p_user_id AND su.decision = 'like'
      AND sf.user_id = p_friend_id AND sf.decision = 'like'
  ) shared
  INNER JOIN public.swipes s
    ON s.user_id = p_user_id AND s.tmdb_id = shared.tmdb_id AND s.type = shared.type AND s.decision = 'like'
  LEFT JOIN public.matches m
    ON m.user_id = s.user_id AND m.tmdb_id = s.tmdb_id AND m.type = s.type
  LEFT JOIN public.titles t
    ON t.tmdb_id = s.tmdb_id AND t.type = s.type
  WHERE EXISTS (
    SELECT 1 FROM public.friend_requests fr
    WHERE fr.status = 'accepted'
      AND ((fr.from_user_id = p_user_id AND fr.to_user_id = p_friend_id)
           OR (fr.from_user_id = p_friend_id AND fr.to_user_id = p_user_id))
  )
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_matches_with_friend(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_matches_with_friend(UUID, UUID) TO service_role;
