/**
 * Matches invariant test: "A user's Matches must contain ONLY movies they said YES (like) to."
 *
 * This test:
 * 1. Simulates the EXACT app flow (upsert swipes, createMatch, removeMatch)
 * 2. Asserts the invariant: no match without a like swipe; no pass in matches
 * 3. Writes a detailed report to test-results/matches-invariant-report.txt so you can view results
 *
 * Run: npm test -- --testPathPattern=matches-invariant
 * View report: open app/test-results/matches-invariant-report.txt
 */

import * as fs from 'fs';
import * as path from 'path';
import { testSupabase } from './test-supabase-client';

const supabase = testSupabase;

const REPORT_DIR = path.join(__dirname, '..', 'test-results');
const REPORT_FILE = path.join(REPORT_DIR, 'matches-invariant-report.txt');

function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

function appendReport(line: string) {
  ensureReportDir();
  fs.appendFileSync(REPORT_FILE, line + '\n');
}

function startReport() {
  ensureReportDir();
  fs.writeFileSync(
    REPORT_FILE,
    `Matches Invariant Report - ${new Date().toISOString()}\n` +
      '============================================================\n\n',
    'utf8'
  );
}

// Same as app: upsert swipe (onConflict user_id,tmdb_id,type)
async function upsertSwipe(
  userId: string,
  tmdbId: number,
  type: 'movie' | 'tv',
  decision: 'like' | 'pass'
) {
  const { data, error } = await supabase
    .from('swipes')
    .upsert(
      { user_id: userId, tmdb_id: tmdbId, type, decision },
      { onConflict: 'user_id,tmdb_id,type', ignoreDuplicates: false }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Same as app: insert match
async function createMatch(userId: string, tmdbId: number, type: 'movie' | 'tv') {
  const { data, error } = await supabase
    .from('matches')
    .insert({ user_id: userId, tmdb_id: tmdbId, type })
    .select()
    .single();
  if (error && error.code !== '23505') throw error;
  if (error?.code === '23505') {
    const { data: existing } = await supabase
      .from('matches')
      .select('*')
      .eq('user_id', userId)
      .eq('tmdb_id', tmdbId)
      .eq('type', type)
      .single();
    return existing;
  }
  return data;
}

// Same as app: delete match
async function removeMatch(userId: string, tmdbId: number, type: 'movie' | 'tv') {
  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('type', type);
  if (error) throw error;
}

describe('Matches invariant: only YES (like) should appear in Matches', () => {
  let testUserId: string;
  let testUserEmail: string;

  beforeAll(async () => {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Supabase not reachable: ${error.message}. Run: supabase start`);
    }
  });

  beforeEach(async () => {
    testUserEmail = `invariant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
    const { data, error } = await supabase.auth.signUp({
      email: testUserEmail,
      password: 'TestPassword123!',
    });
    if (error || !data.user) throw new Error(`SignUp failed: ${error?.message}`);
    testUserId = data.user.id;
    await new Promise((r) => setTimeout(r, 400));
  });

  afterEach(async () => {
    try {
      await supabase.from('swipes').delete().eq('user_id', testUserId);
      await supabase.from('matches').delete().eq('user_id', testUserId);
      await supabase.auth.signOut();
    } catch (_) {}
  });

  it('writes diagnostic report and asserts: like then pass on same movie => 0 matches', async () => {
    startReport();
    appendReport('--- Test 1: Like then Pass on same movie ---');
    const tmdbId = 550;
    const type = 'movie';

    // App flow: LIKE
    await upsertSwipe(testUserId, tmdbId, type, 'like');
    await createMatch(testUserId, tmdbId, type);
    appendReport(`After LIKE: upserted swipe (like), created match for tmdb_id=${tmdbId} type=${type}`);

    // App flow: PASS (same movie – should overwrite swipe and remove match)
    await upsertSwipe(testUserId, tmdbId, type, 'pass');
    await removeMatch(testUserId, tmdbId, type);
    appendReport(`After PASS: upserted swipe (pass), removed match for tmdb_id=${tmdbId} type=${type}`);

    // What's in the DB?
    const { data: swipes } = await supabase
      .from('swipes')
      .select('id, user_id, tmdb_id, type, decision, created_at')
      .eq('user_id', testUserId);
    const { data: matches } = await supabase
      .from('matches')
      .select('id, user_id, tmdb_id, type, created_at')
      .eq('user_id', testUserId);
    const { data: viewRows } = await supabase
      .from('matches_with_titles')
      .select('id, user_id, tmdb_id, type, title, created_at')
      .eq('user_id', testUserId);

    appendReport('');
    appendReport('Swipes in DB:');
    appendReport(JSON.stringify(swipes || [], null, 2));
    appendReport('');
    appendReport('Matches table (raw):');
    appendReport(JSON.stringify(matches || [], null, 2));
    appendReport('');
    appendReport('matches_with_titles view:');
    appendReport(JSON.stringify(viewRows || [], null, 2));

    // Invariant: user said PASS => must have 0 matches and 0 view rows
    const passSwipe = swipes?.find((s: any) => s.tmdb_id === tmdbId && s.type === type);
    const matchRow = matches?.find((m: any) => m.tmdb_id === tmdbId && m.type === type);

    appendReport('');
    appendReport(`Swipe decision for (${tmdbId}, ${type}): ${(passSwipe as any)?.decision ?? 'MISSING'}`);
    appendReport(`Match row exists: ${matchRow ? 'YES (BUG)' : 'NO (correct)'}`);
    appendReport(`View row count: ${viewRows?.length ?? 0} (must be 0)`);

    expect((passSwipe as any)?.decision).toBe('pass');
    expect(matchRow).toBeUndefined();
    expect(viewRows?.length ?? 0).toBe(0);
  }, 15000);

  it('writes report and asserts: 2 likes + 1 pass => exactly 2 in matches and in view', async () => {
    appendReport('\n--- Test 2: 2 likes, 1 pass => only 2 in Matches ---');

    const like1 = { tmdbId: 13, type: 'movie' as const };
    const like2 = { tmdbId: 278, type: 'movie' as const };
    const pass1 = { tmdbId: 424, type: 'movie' as const };

    await upsertSwipe(testUserId, like1.tmdbId, like1.type, 'like');
    await createMatch(testUserId, like1.tmdbId, like1.type);
    await upsertSwipe(testUserId, like2.tmdbId, like2.type, 'like');
    await createMatch(testUserId, like2.tmdbId, like2.type);
    await upsertSwipe(testUserId, pass1.tmdbId, pass1.type, 'pass');
    await removeMatch(testUserId, pass1.tmdbId, pass1.type);

    const { data: swipes } = await supabase
      .from('swipes')
      .select('tmdb_id, type, decision')
      .eq('user_id', testUserId);
    const { data: matches } = await supabase
      .from('matches')
      .select('tmdb_id, type')
      .eq('user_id', testUserId);
    const { data: viewRows } = await supabase
      .from('matches_with_titles')
      .select('tmdb_id, type, title')
      .eq('user_id', testUserId);

    appendReport('Swipes: ' + JSON.stringify(swipes));
    appendReport('Matches (raw): ' + JSON.stringify(matches));
    appendReport('View rows: ' + JSON.stringify(viewRows));

    const passInMatches = (matches || []).some(
      (m: any) => m.tmdb_id === pass1.tmdbId && m.type === pass1.type
    );
    const viewCount = viewRows?.length ?? 0;
    const matchCount = matches?.length ?? 0;

    appendReport(`Pass (${pass1.tmdbId}) in matches: ${passInMatches ? 'YES (BUG)' : 'NO (correct)'}`);
    appendReport(`Match count: ${matchCount} (expected 2)`);
    appendReport(`View count: ${viewCount} (expected 2)`);

    expect(passInMatches).toBe(false);
    expect(matchCount).toBe(2);
    expect(viewCount).toBe(2);
  }, 15000);
});
