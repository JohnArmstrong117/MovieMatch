-- User blocks, moderation reports, and enforcement: hide blocked users from inbox/search/feeds;
-- prevent new friend requests, recommendations, and shared views; log events for moderation.

-- ---------------------------------------------------------------------------
-- Core: directional block (blocker chose to block blocked). Mutual exclusion for
-- interactions uses users_have_block(u1, u2) (either direction).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);

COMMENT ON TABLE public.user_blocks IS 'blocker_id blocked blocked_id; used to filter UX and forbid new interactions.';

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view blocks they are part of"
  ON public.user_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

CREATE POLICY "Users can create a block as blocker"
  ON public.user_blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can remove their own block"
  ON public.user_blocks FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);

-- ---------------------------------------------------------------------------
-- Moderation queue: reports and block events (for dashboards / webhooks).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recommendation_id UUID REFERENCES public.recommendations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('report', 'block')),
  reason_code TEXT NOT NULL,
  reason_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_created ON public.moderation_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_subject ON public.moderation_reports(subject_user_id);

COMMENT ON TABLE public.moderation_reports IS 'User reports and block events. In Supabase Dashboard: Database → Webhooks → add INSERT on public.moderation_reports to notify moderators (email, Slack, Edge Function).';

ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own reports"
  ON public.moderation_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can read their own submitted reports"
  ON public.moderation_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.users_have_block(u1 UUID, u2 UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE (ub.blocker_id = u1 AND ub.blocked_id = u2)
       OR (ub.blocker_id = u2 AND ub.blocked_id = u1)
  );
$$;

COMMENT ON FUNCTION public.users_have_block(UUID, UUID) IS 'True if a block exists in either direction between the two users.';

-- Authenticated: check if me and another user have any block (for UI guards).
CREATE OR REPLACE FUNCTION public.is_blocked_with(p_other_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.users_have_block(auth.uid(), p_other_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_with(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.user_ids_with_block_relationship()
RETURNS TABLE (other_user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.blocked_id AS other_user_id
  FROM public.user_blocks ub
  WHERE ub.blocker_id = auth.uid()
  UNION
  SELECT ub.blocker_id AS other_user_id
  FROM public.user_blocks ub
  WHERE ub.blocked_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.user_ids_with_block_relationship() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_ids_with_block_relationship() TO service_role;

-- ---------------------------------------------------------------------------
-- Triggers: no new friend requests or recommendations across a block.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_friend_request_not_blocked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.users_have_block(NEW.from_user_id, NEW.to_user_id) THEN
    RAISE EXCEPTION 'Cannot interact with this user.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friend_requests_enforce_not_blocked ON public.friend_requests;
CREATE TRIGGER friend_requests_enforce_not_blocked
  BEFORE INSERT ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_friend_request_not_blocked();

CREATE OR REPLACE FUNCTION public.check_recommendation_friend()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.users_have_block(NEW.from_user_id, NEW.to_user_id) THEN
    RAISE EXCEPTION 'Cannot send recommendations to this user.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.friend_requests fr
    WHERE fr.status = 'accepted'
      AND ((fr.from_user_id = NEW.from_user_id AND fr.to_user_id = NEW.to_user_id)
           OR (fr.from_user_id = NEW.to_user_id AND fr.to_user_id = NEW.from_user_id))
  ) THEN
    RAISE EXCEPTION 'Can only recommend to an accepted friend';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- After a block: remove friend_requests between the pair (any status).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.after_block_remove_friend_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.friend_requests fr
  WHERE (fr.from_user_id = NEW.blocker_id AND fr.to_user_id = NEW.blocked_id)
     OR (fr.from_user_id = NEW.blocked_id AND fr.to_user_id = NEW.blocker_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_block_cleanup_friend_requests ON public.user_blocks;
CREATE TRIGGER user_block_cleanup_friend_requests
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.after_block_remove_friend_rows();

-- ---------------------------------------------------------------------------
-- RPC: report / block (validates auth and writes moderation_reports + block)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.report_recommendation(
  p_recommendation_id UUID,
  p_reason_code TEXT,
  p_reason_detail TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from UUID;
BEGIN
  SELECT r.from_user_id INTO v_from
  FROM public.recommendations r
  WHERE r.id = p_recommendation_id AND r.to_user_id = auth.uid();
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'Recommendation not found' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.moderation_reports (
    reporter_id, subject_user_id, recommendation_id, event_type, reason_code, reason_detail
  ) VALUES (
    auth.uid(),
    v_from,
    p_recommendation_id,
    'report',
    COALESCE(NULLIF(trim(p_reason_code), ''), 'unspecified'),
    NULLIF(trim(p_reason_detail), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_recommendation(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_recommendation(UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.block_user(
  p_blocked_id UUID,
  p_reason_code TEXT,
  p_reason_detail TEXT,
  p_recommendation_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_blocked_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot block yourself' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (auth.uid(), p_blocked_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.moderation_reports (
    reporter_id, subject_user_id, recommendation_id, event_type, reason_code, reason_detail
  ) VALUES (
    auth.uid(),
    p_blocked_id,
    p_recommendation_id,
    'block',
    COALESCE(NULLIF(trim(p_reason_code), ''), 'unspecified'),
    NULLIF(trim(p_reason_detail), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_user(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(UUID, TEXT, TEXT, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Replace inbox + shared + search RPCs (auth.uid() for caller; exclude blocks).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_recommendations_received(UUID);

CREATE OR REPLACE FUNCTION public.get_recommendations_received()
RETURNS TABLE (
  id UUID,
  from_user_id UUID,
  from_user_display_name TEXT,
  tmdb_id INTEGER,
  type TEXT,
  created_at TIMESTAMPTZ,
  message TEXT,
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
    r.message,
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
  WHERE r.to_user_id = auth.uid()
    AND NOT public.users_have_block(auth.uid(), r.from_user_id)
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_recommendations_received() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recommendations_received() TO service_role;

DROP FUNCTION IF EXISTS public.get_recommendations_received_unread_count(UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_recommendations_received_unread_count(
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.recommendations r
  WHERE r.to_user_id = auth.uid()
    AND NOT public.users_have_block(auth.uid(), r.from_user_id)
    AND (p_since IS NULL OR r.created_at > p_since);
$$;

GRANT EXECUTE ON FUNCTION public.get_recommendations_received_unread_count(TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recommendations_received_unread_count(TIMESTAMPTZ) TO service_role;

DROP FUNCTION IF EXISTS public.get_shared_matches_with_friend(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_shared_matches_with_friend(p_friend_id UUID)
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
    WHERE su.user_id = auth.uid() AND su.decision = 'like'
      AND sf.user_id = p_friend_id AND sf.decision = 'like'
  ) shared
  INNER JOIN public.swipes s
    ON s.user_id = auth.uid() AND s.tmdb_id = shared.tmdb_id AND s.type = shared.type AND s.decision = 'like'
  LEFT JOIN public.matches m
    ON m.user_id = s.user_id AND m.tmdb_id = s.tmdb_id AND m.type = s.type
  LEFT JOIN public.titles t
    ON t.tmdb_id = s.tmdb_id AND t.type = s.type
  WHERE NOT public.users_have_block(auth.uid(), p_friend_id)
    AND EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE fr.status = 'accepted'
        AND ((fr.from_user_id = auth.uid() AND fr.to_user_id = p_friend_id)
             OR (fr.from_user_id = p_friend_id AND fr.to_user_id = auth.uid()))
    )
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_matches_with_friend(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_matches_with_friend(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.list_accepted_friends_for_user()
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  request_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN fr.from_user_id = auth.uid() THEN fr.to_user_id ELSE fr.from_user_id END AS id,
    p.display_name,
    p.avatar_url,
    fr.id AS request_id,
    fr.created_at
  FROM public.friend_requests fr
  JOIN public.profiles p ON p.id = CASE WHEN fr.from_user_id = auth.uid() THEN fr.to_user_id ELSE fr.from_user_id END
  WHERE fr.status = 'accepted'
    AND (fr.from_user_id = auth.uid() OR fr.to_user_id = auth.uid())
    AND NOT public.users_have_block(auth.uid(), CASE WHEN fr.from_user_id = auth.uid() THEN fr.to_user_id ELSE fr.from_user_id END);
$$;

GRANT EXECUTE ON FUNCTION public.list_accepted_friends_for_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_accepted_friends_for_user() TO service_role;

CREATE OR REPLACE FUNCTION public.search_profiles_for_friends(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (id UUID, display_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.id != auth.uid()
    AND length(trim(p_query)) >= 1
    AND p.display_name ILIKE '%' || trim(p_query) || '%'
    AND NOT public.users_have_block(auth.uid(), p.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE (fr.from_user_id = auth.uid() AND fr.to_user_id = p.id)
         OR (fr.from_user_id = p.id AND fr.to_user_id = auth.uid())
    )
  ORDER BY p.display_name NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

GRANT EXECUTE ON FUNCTION public.search_profiles_for_friends(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_profiles_for_friends(TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.lookup_users_by_emails(p_caller_id UUID, p_emails TEXT[])
RETURNS TABLE (email TEXT, user_id UUID, display_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email, p.id AS user_id, p.display_name
  FROM public.profiles p
  WHERE p_caller_id = auth.uid()
    AND p.email = ANY(p_emails)
    AND p.id != p_caller_id
    AND NOT public.users_have_block(auth.uid(), p.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE (fr.from_user_id = p_caller_id AND fr.to_user_id = p.id)
         OR (fr.from_user_id = p.id AND fr.to_user_id = p_caller_id)
    )
  ORDER BY p.display_name NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.lookup_users_by_phones(p_caller_id UUID, p_phones TEXT[])
RETURNS TABLE (phone TEXT, user_id UUID, display_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized_input AS (
    SELECT DISTINCT public.normalize_phone_digits(ph) AS digits
    FROM unnest(p_phones) AS ph
    WHERE public.normalize_phone_digits(ph) != ''
  )
  SELECT p.phone, p.id AS user_id, p.display_name
  FROM public.profiles p
  JOIN normalized_input ni ON ni.digits = p.phone
  WHERE p_caller_id = auth.uid()
    AND p.phone IS NOT NULL
    AND p.id != p_caller_id
    AND NOT public.users_have_block(auth.uid(), p.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE (fr.from_user_id = p_caller_id AND fr.to_user_id = p.id)
         OR (fr.from_user_id = p.id AND fr.to_user_id = p_caller_id)
    )
  ORDER BY p.display_name NULLS LAST;
$$;
