-- Optional: Create a view for matches that joins with titles for easier querying
-- This view combines matches with title data for richer queries
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
LEFT JOIN public.titles t ON m.tmdb_id = t.tmdb_id AND m.type = t.type;

-- Grant access to the view
GRANT SELECT ON public.matches_with_titles TO authenticated;

-- Create a view for user swipe statistics
CREATE OR REPLACE VIEW public.user_swipe_stats AS
SELECT 
  user_id,
  type,
  decision,
  COUNT(*) as count,
  MAX(created_at) as last_swipe_at
FROM public.swipes
GROUP BY user_id, type, decision;

-- Grant access to the view
GRANT SELECT ON public.user_swipe_stats TO authenticated;

