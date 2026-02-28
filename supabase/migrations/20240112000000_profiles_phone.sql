-- Add phone to profiles for contact-based friend lookup (by phone number).
-- Stored as digits-only for matching (e.g. 15551234567).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone) WHERE phone IS NOT NULL;

COMMENT ON COLUMN public.profiles.phone IS 'User phone (digits-only for matching). Set at signup or in profile.';

-- Normalize phone to digits only (used in RPC for matching)
CREATE OR REPLACE FUNCTION public.normalize_phone_digits(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(trim(p_phone), ''), '[^0-9]', '', 'g');
$$;

-- RPC: look up which phone numbers belong to registered users (for "Add from contacts").
-- Input phones are normalized to digits; compares to profiles.phone (stored as digits). Excludes self and already friends/pending.
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
  WHERE p.phone IS NOT NULL
    AND p.id != p_caller_id
    AND NOT EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE (fr.from_user_id = p_caller_id AND fr.to_user_id = p.id)
         OR (fr.from_user_id = p.id AND fr.to_user_id = p_caller_id)
    )
  ORDER BY p.display_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_users_by_phones(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_users_by_phones(UUID, TEXT[]) TO service_role;

COMMENT ON FUNCTION public.lookup_users_by_phones(UUID, TEXT[]) IS
  'Returns user_id and display_name for profiles whose phone (digits) matches any normalized input; excludes caller and existing friend/pending.';
