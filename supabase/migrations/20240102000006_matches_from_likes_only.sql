-- Matches list source of truth: SWIPES with decision = 'like' only.
-- This view ensures the Matches tab only shows titles the user has liked (green heart).
-- Passed titles never appear, even if the matches table has stale rows.
--
-- One row per (user_id, tmdb_id, type) where the user's current swipe is 'like'.
-- match id/watched/notes/rating come from matches table (left join so we can show
-- likes that don't have a match row yet; sync/createMatch will add them).

CREATE OR REPLACE VIEW public.matches_with_titles AS
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
WHERE s.decision = 'like';

COMMENT ON VIEW public.matches_with_titles IS
  'One row per liked title (swipes.decision=like). Passed titles never appear.';
