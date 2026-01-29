-- Helper function to automatically create matches from liked swipes
-- This function can be called to sync matches from swipes
-- IMPORTANT: Only syncs swipes with decision = 'like', never 'pass'
-- Also removes matches that don't have a corresponding 'like' swipe
CREATE OR REPLACE FUNCTION public.sync_matches_from_swipes(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER;
  deleted_count INTEGER;
BEGIN
  -- First, remove matches that don't have a corresponding 'like' swipe
  -- This handles cases where:
  -- 1. User changed a like to a pass (shouldn't happen with current constraints, but safety check)
  -- 2. Old data that shouldn't exist
  -- 3. Matches created before the sync function was properly filtering
  
  DELETE FROM public.matches m
  WHERE m.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.swipes s
      WHERE s.user_id = m.user_id
        AND s.tmdb_id = m.tmdb_id
        AND s.type = m.type
        AND s.decision = 'like'  -- Only keep matches with 'like' swipes
    );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Then, insert new matches from swipes where decision = 'like' and not already in matches
  INSERT INTO public.matches (user_id, tmdb_id, type, created_at)
  SELECT 
    s.user_id,
    s.tmdb_id,
    s.type,
    s.created_at
  FROM public.swipes s
  WHERE s.user_id = p_user_id
    AND s.decision = 'like'  -- CRITICAL: Only sync likes, never passes
    AND NOT EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.user_id = s.user_id
        AND m.tmdb_id = s.tmdb_id
        AND m.type = s.type
    )
  ON CONFLICT (user_id, tmdb_id, type) DO NOTHING;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  
  -- Return the number of new matches inserted (for backwards compatibility)
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's available streaming services as provider keys
-- Useful for filtering TMDB results by user's subscriptions
CREATE OR REPLACE FUNCTION public.get_user_provider_keys(p_user_id UUID)
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT ss.provider_key
    FROM public.user_streaming_services uss
    JOIN public.streaming_services ss ON uss.service_id = ss.id
    WHERE uss.user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's preferred genre IDs (TMDB external IDs)
CREATE OR REPLACE FUNCTION public.get_user_genre_ids(p_user_id UUID)
RETURNS INTEGER[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT g.external_id
    FROM public.user_genre_prefs ugp
    JOIN public.genres g ON ugp.genre_id = g.id
    WHERE ugp.user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has already swiped on a title
CREATE OR REPLACE FUNCTION public.has_user_swiped(p_user_id UUID, p_tmdb_id INTEGER, p_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.swipes
    WHERE user_id = p_user_id
      AND tmdb_id = p_tmdb_id
      AND type = p_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's swipe count by type
CREATE OR REPLACE FUNCTION public.get_user_swipe_count(p_user_id UUID, p_type TEXT DEFAULT NULL)
RETURNS TABLE(
  type TEXT,
  decision TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.type,
    s.decision,
    COUNT(*)::BIGINT as count
  FROM public.swipes s
  WHERE s.user_id = p_user_id
    AND (p_type IS NULL OR s.type = p_type)
  GROUP BY s.type, s.decision;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to upsert a title (insert or update)
-- Useful for caching TMDB data
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
  ON CONFLICT (tmdb_id) DO UPDATE SET
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

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.sync_matches_from_swipes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_provider_keys(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_genre_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_user_swiped(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_swipe_count(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_title(INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, INTEGER, BOOLEAN, JSONB) TO authenticated;

