-- Destination for moderation alerts (reports/blocks). Edge Functions or automations can read this row.

ALTER TABLE public.moderation_config
  ADD COLUMN IF NOT EXISTS moderation_notify_email TEXT;

COMMENT ON COLUMN public.moderation_config.moderation_notify_email IS
  'Email address for moderation notifications. Change via UPDATE on moderation_config; used by webhooks/Edge Functions.';

UPDATE public.moderation_config
SET moderation_notify_email = 'j.armstrong.software@outlook.com'
WHERE id = 1;

CREATE OR REPLACE FUNCTION public.moderation_notify_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT moderation_notify_email FROM public.moderation_config WHERE id = 1;
$$;

COMMENT ON FUNCTION public.moderation_notify_email() IS 'Returns configured moderation inbox email (service use only).';

GRANT EXECUTE ON FUNCTION public.moderation_notify_email() TO service_role;
