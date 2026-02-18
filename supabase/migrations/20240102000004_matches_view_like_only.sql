-- Ensure matches_with_titles only shows titles the user has LIKED (green heart).
-- We INNER JOIN on swipes where decision = 'like', so passed titles never appear
-- even if the matches table is temporarily out of sync.

CREATE OR REPLACE VIEW public.matches_with_titles AS
SELECT
  m.id,
  m.user_id,
  m.tmdb_id,
  m.type,
  m.watched,
  m.notes,
  m.rating,
  m.created_at,
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
FROM public.matches m
INNER JOIN public.swipes s
  ON s.user_id = m.user_id
  AND s.tmdb_id = m.tmdb_id
  AND s.type = m.type
  AND s.decision = 'like'
LEFT JOIN public.titles t
  ON m.tmdb_id = t.tmdb_id AND m.type = t.type;

COMMENT ON VIEW public.matches_with_titles IS
  'Matches joined with titles; only includes rows where the user has a current like swipe (never pass).';
