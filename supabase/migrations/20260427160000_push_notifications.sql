-- Push notification tokens + triggers for friend requests and recommendations.
-- Uses Expo Push API via pg_net (HTTPS calls from Postgres).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.push_notification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_label TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_notification_tokens_user_token_idx
  ON public.push_notification_tokens(user_id, expo_push_token);

CREATE OR REPLACE FUNCTION public.set_push_notification_tokens_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_push_notification_tokens_updated_at ON public.push_notification_tokens;
CREATE TRIGGER set_push_notification_tokens_updated_at
BEFORE UPDATE ON public.push_notification_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_push_notification_tokens_updated_at();

ALTER TABLE public.push_notification_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push tokens select own" ON public.push_notification_tokens;
CREATE POLICY "push tokens select own"
  ON public.push_notification_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push tokens insert own" ON public.push_notification_tokens;
CREATE POLICY "push tokens insert own"
  ON public.push_notification_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push tokens update own" ON public.push_notification_tokens;
CREATE POLICY "push tokens update own"
  ON public.push_notification_tokens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push tokens delete own" ON public.push_notification_tokens;
CREATE POLICY "push tokens delete own"
  ON public.push_notification_tokens
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.enqueue_expo_push_for_user(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT expo_push_token
    FROM public.push_notification_tokens
    WHERE user_id = p_user_id
      AND enabled = true
  LOOP
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      body := jsonb_build_object(
        'to', t.expo_push_token,
        'title', p_title,
        'body', p_body,
        'sound', 'default',
        'priority', 'high',
        'channelId', 'default',
        'data', COALESCE(p_data, '{}'::jsonb)
      )
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_expo_push_for_user(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_expo_push_for_user(UUID, TEXT, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_friend_request_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  sender_name TEXT;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), 'Someone')
  INTO sender_name
  FROM public.profiles
  WHERE id = NEW.from_user_id;

  PERFORM public.enqueue_expo_push_for_user(
    NEW.to_user_id,
    'New friend request',
    sender_name || ' sent you a friend request on Meesh.',
    jsonb_build_object(
      'kind', 'friend_request',
      'request_id', NEW.id,
      'from_user_id', NEW.from_user_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_notify_friend_request_push ON public.friend_requests;
CREATE TRIGGER trig_notify_friend_request_push
AFTER INSERT ON public.friend_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_friend_request_push();

CREATE OR REPLACE FUNCTION public.notify_recommendation_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  sender_name TEXT;
  media_label TEXT;
BEGIN
  SELECT COALESCE(NULLIF(display_name, ''), 'Someone')
  INTO sender_name
  FROM public.profiles
  WHERE id = NEW.from_user_id;

  media_label := CASE WHEN NEW.type = 'tv' THEN 'a show' ELSE 'a movie' END;

  PERFORM public.enqueue_expo_push_for_user(
    NEW.to_user_id,
    'New recommendation',
    sender_name || ' recommended ' || media_label || ' for you.',
    jsonb_build_object(
      'kind', 'recommendation',
      'recommendation_id', NEW.id,
      'from_user_id', NEW.from_user_id,
      'tmdb_id', NEW.tmdb_id,
      'type', NEW.type
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_notify_recommendation_push ON public.recommendations;
CREATE TRIGGER trig_notify_recommendation_push
AFTER INSERT ON public.recommendations
FOR EACH ROW
EXECUTE FUNCTION public.notify_recommendation_push();

