-- Split previously bundled slugs into separate selectable chips.
-- Keeps behavior equivalent for TV by mapping both split slugs to the same TV genre IDs in code.

INSERT INTO public.user_unified_genres (user_id, slug)
SELECT user_id, 'action'
FROM public.user_unified_genres
WHERE slug = 'action_adventure'
ON CONFLICT (user_id, slug) DO NOTHING;

INSERT INTO public.user_unified_genres (user_id, slug)
SELECT user_id, 'adventure'
FROM public.user_unified_genres
WHERE slug = 'action_adventure'
ON CONFLICT (user_id, slug) DO NOTHING;

INSERT INTO public.user_unified_genres (user_id, slug)
SELECT user_id, 'sci_fi'
FROM public.user_unified_genres
WHERE slug = 'sci_fi_fantasy'
ON CONFLICT (user_id, slug) DO NOTHING;

INSERT INTO public.user_unified_genres (user_id, slug)
SELECT user_id, 'fantasy'
FROM public.user_unified_genres
WHERE slug = 'sci_fi_fantasy'
ON CONFLICT (user_id, slug) DO NOTHING;

DELETE FROM public.user_unified_genres
WHERE slug IN ('action_adventure', 'sci_fi_fantasy');
