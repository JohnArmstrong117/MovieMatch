import { supabase } from './supabase';

/** Shown when user-submitted text fails moderation (client pre-check or server trigger). */
export const MODERATION_BLOCKED_MESSAGE =
  "That text isn't allowed. Please remove inappropriate language and try again.";

/** Returns true if text is empty or passes the server moderation list. */
export async function checkModerationAllowed(text: string | null | undefined): Promise<boolean> {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return true;
  const { data, error } = await supabase.rpc('moderation_text_is_allowed', { p_text: t });
  if (error) throw error;
  return data === true;
}

export async function assertModerationAllowed(text: string | null | undefined): Promise<void> {
  const ok = await checkModerationAllowed(text);
  if (!ok) throw new Error(MODERATION_BLOCKED_MESSAGE);
}
