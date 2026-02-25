-- Unread recommendations count for inbox badge (recommendations received since p_since).

CREATE OR REPLACE FUNCTION public.get_recommendations_received_unread_count(
  p_user_id UUID,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.recommendations
  WHERE to_user_id = p_user_id
    AND (p_since IS NULL OR created_at > p_since);
$$;

GRANT EXECUTE ON FUNCTION public.get_recommendations_received_unread_count(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recommendations_received_unread_count(UUID, TIMESTAMPTZ) TO service_role;
