/**
 * Verify Supabase Auth access token (ES256) via project JWKS.
 * Use with [functions.*] verify_jwt = false so Authorization reaches the worker.
 */
import * as jose from 'https://deno.land/x/jose@v4.15.5/index.ts';

export async function getUserIdFromAuthHeader(
  authHeader: string | null,
  supabaseUrl: string
): Promise<string | null> {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!token) return null;

  const base = supabaseUrl.replace(/\/$/, '');
  const issuer = `${base}/auth/v1`;
  const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
  const JWKS = jose.createRemoteJWKSet(jwksUrl);

  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer,
      audience: 'authenticated',
      clockTolerance: 120,
    });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch (e) {
    console.error('[verify_user_jwt] jwtVerify failed:', e);
    return null;
  }
}
