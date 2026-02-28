-- Add email to profiles for contact-based friend lookup (synced from auth.users).
-- Used so we can look up which contacts are already on the app.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;

COMMENT ON COLUMN public.profiles.email IS 'User email from auth, for contact matching. Not exposed in public API.';

-- Update trigger to set email on new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing profiles from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- RPC: look up which emails belong to registered users (for "Add from contacts").
-- Returns email, user_id and display_name; excludes self and already friends/pending.
CREATE OR REPLACE FUNCTION public.lookup_users_by_emails(p_caller_id UUID, p_emails TEXT[])
RETURNS TABLE (email TEXT, user_id UUID, display_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email, p.id AS user_id, p.display_name
  FROM public.profiles p
  WHERE p.email = ANY(p_emails)
    AND p.id != p_caller_id
    AND NOT EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE (fr.from_user_id = p_caller_id AND fr.to_user_id = p.id)
         OR (fr.from_user_id = p.id AND fr.to_user_id = p_caller_id)
    )
  ORDER BY p.display_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_users_by_emails(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_users_by_emails(UUID, TEXT[]) TO service_role;

COMMENT ON FUNCTION public.lookup_users_by_emails(UUID, TEXT[]) IS
  'Returns user_id and display_name for profiles whose email is in the given list; excludes caller and existing friend/pending.';
