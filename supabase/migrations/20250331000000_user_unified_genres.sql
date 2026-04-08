-- Unified genre preferences: one slug per chip, mapped to movie vs TV TMDB genre IDs in the app / Edge Function.

CREATE TABLE IF NOT EXISTS public.user_unified_genres (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_user_unified_genres_user_id ON public.user_unified_genres(user_id);

ALTER TABLE public.user_unified_genres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own unified genre preferences" ON public.user_unified_genres;
CREATE POLICY "Users can view their own unified genre preferences"
  ON public.user_unified_genres FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own unified genre preferences" ON public.user_unified_genres;
CREATE POLICY "Users can manage their own unified genre preferences"
  ON public.user_unified_genres FOR ALL
  USING (auth.uid() = user_id);

-- Backfill from legacy movie genre_id rows (same mapping as app LEGACY_MOVIE_GENRE_ID_TO_SLUG).
INSERT INTO public.user_unified_genres (user_id, slug)
SELECT DISTINCT ug.user_id, m.slug
FROM public.user_genres ug
INNER JOIN (
  VALUES
    (28, 'action'),
    (12, 'adventure'),
    (16, 'animation'),
    (35, 'comedy'),
    (80, 'crime'),
    (99, 'documentary'),
    (18, 'drama'),
    (10751, 'family'),
    (14, 'fantasy'),
    (878, 'sci_fi'),
    (36, 'history'),
    (27, 'horror'),
    (10402, 'music'),
    (9648, 'mystery'),
    (10749, 'romance'),
    (53, 'thriller'),
    (10752, 'war_politics'),
    (37, 'western'),
    (10770, 'tv_movie')
) AS m(genre_id, slug) ON ug.genre_id = m.genre_id
ON CONFLICT (user_id, slug) DO NOTHING;
