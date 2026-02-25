-- Movie recommendations: one user recommends a title (from their matches) to a friend.
-- Only allowed between accepted friends.

CREATE TABLE IF NOT EXISTS public.recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_user_id, to_user_id, tmdb_id, type),
  CHECK (from_user_id != to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_from ON public.recommendations(from_user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_to ON public.recommendations(to_user_id);

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

-- Users can see recommendations they sent or received
CREATE POLICY "Users can view own recommendations"
  ON public.recommendations FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Users can send recommendations (insert as from_user_id); enforce friends in app or trigger
CREATE POLICY "Users can send recommendations"
  ON public.recommendations FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- Optional: allow delete to "unsend" a recommendation
CREATE POLICY "Users can delete recommendations they sent"
  ON public.recommendations FOR DELETE
  USING (auth.uid() = from_user_id);

-- Only allow recommending to an accepted friend
CREATE OR REPLACE FUNCTION public.check_recommendation_friend()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
CREATE TRIGGER recommendations_must_be_friends
  BEFORE INSERT ON public.recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_recommendation_friend();
