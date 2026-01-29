-- Fix sync_matches_from_swipes to also remove matches that shouldn't exist
-- This ensures matches only contain titles the user has liked, and removes any
-- matches for titles the user has passed or hasn't swiped on

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

-- Grant execute permissions (should already exist, but ensure it's there)
GRANT EXECUTE ON FUNCTION public.sync_matches_from_swipes(UUID) TO authenticated;
