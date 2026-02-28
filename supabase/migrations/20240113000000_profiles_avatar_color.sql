-- Profile icon background color (for initial-letter avatar when no image).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_color TEXT;

COMMENT ON COLUMN public.profiles.avatar_color IS 'Hex color for profile circle background (e.g. #e01245).';
