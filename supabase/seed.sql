-- Seed data for streaming_services
-- Provider keys map to TMDB provider IDs
-- Common streaming services with their TMDB provider IDs
INSERT INTO public.streaming_services (name, provider_key) VALUES
  ('Netflix', '8'),
  ('Amazon Prime Video', '9'),
  ('Disney Plus', '337'),
  ('Hulu', '15'),
  ('HBO Max', '384'),
  ('Paramount Plus', '531'),
  ('Apple TV Plus', '350'),
  ('Peacock', '386'),
  ('Showtime', '37'),
  ('Starz', '318'),
  ('CBS All Access', '258'),
  ('Crunchyroll', '283'),
  ('Funimation', '280'),
  ('YouTube Premium', '188'),
  ('Tubi', '73'),
  ('Pluto TV', '300'),
  ('Crackle', '12'),
  ('Vudu', '7'),
  ('FandangoNOW', '105'),
  ('Redbox', '358')
ON CONFLICT (name) DO NOTHING;

-- Seed data for genres
-- TMDB genre IDs and names
INSERT INTO public.genres (name, external_id) VALUES
  ('Action', 28),
  ('Adventure', 12),
  ('Animation', 16),
  ('Comedy', 35),
  ('Crime', 80),
  ('Documentary', 99),
  ('Drama', 18),
  ('Family', 10751),
  ('Fantasy', 14),
  ('History', 36),
  ('Horror', 27),
  ('Music', 10402),
  ('Mystery', 9648),
  ('Romance', 10749),
  ('Science Fiction', 878),
  ('TV Movie', 10770),
  ('Thriller', 53),
  ('War', 10752),
  ('Western', 37)
ON CONFLICT (name) DO NOTHING;

