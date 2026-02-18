/**
 * Diagnose Matches invariant: "A user's Matches must contain ONLY titles they said YES (like) to."
 *
 * Scans the database and reports:
 * - Matches that have NO corresponding like swipe (stale/bug)
 * - Pass swipes that still have a match row (bug)
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY (to read all users' swipes/matches).
 * Local Supabase: get key with `supabase status` (service_role key).
 *
 * Usage:
 *   cd app
 *   set EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
 *   set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
 *   node scripts/diagnose-matches.js
 *
 * Output: test-results/matches-diagnostic-<timestamp>.txt (and console)
 */

const path = require('path');
const fs = require('fs');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is required. Get it with: supabase status (see service_role key)'
  );
  process.exit(1);
}

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const reportDir = path.join(__dirname, '..', 'test-results');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(reportDir, `matches-diagnostic-${timestamp}.txt`);

  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const lines = [];
  function log(msg) {
    lines.push(msg);
    console.log(msg);
  }

  log('Matches Invariant Diagnostic - ' + new Date().toISOString());
  log('============================================================');
  log('Invariant: A user\'s Matches must contain ONLY titles they said YES (like) to.');
  log('');

  // Get all user_ids that have swipes
  const { data: swipesAll, error: eSwipes } = await supabase
    .from('swipes')
    .select('user_id, tmdb_id, type, decision, created_at')
    .order('user_id')
    .order('created_at', { ascending: false });

  if (eSwipes) {
    log('ERROR fetching swipes: ' + eSwipes.message);
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    console.log('\nReport written to: ' + reportPath);
    process.exit(1);
  }

  const { data: matchesAll, error: eMatches } = await supabase
    .from('matches')
    .select('id, user_id, tmdb_id, type, created_at')
    .order('user_id');

  if (eMatches) {
    log('ERROR fetching matches: ' + eMatches.message);
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    process.exit(1);
  }

  const swipes = swipesAll || [];
  const matches = matchesAll || [];

  const userIds = [...new Set(swipes.map((s) => s.user_id))];
  log(`Users with swipes: ${userIds.length}`);
  log(`Total swipes: ${swipes.length}`);
  log(`Total matches: ${matches.length}`);
  log('');

  let totalViolations = 0;

  for (const userId of userIds) {
    const userSwipes = swipes.filter((s) => s.user_id === userId);
    const userMatches = matches.filter((m) => m.user_id === userId);

    const likes = userSwipes.filter((s) => s.decision === 'like');
    const passes = userSwipes.filter((s) => s.decision === 'pass');

    // Key: "tmdbId-type"
    const likeKeys = new Set(likes.map((s) => `${s.tmdb_id}-${s.type}`));
    const passKeys = new Set(passes.map((s) => `${s.tmdb_id}-${s.type}`));

    const violations = [];

    // Violation 1: Match exists but user's current swipe is PASS (or no swipe)
    for (const m of userMatches) {
      const key = `${m.tmdb_id}-${m.type}`;
      if (passKeys.has(key)) {
        violations.push({
          type: 'MATCH_WITH_PASS',
          message: `Match exists for (tmdb_id=${m.tmdb_id}, type=${m.type}) but user swiped PASS`,
          matchId: m.id,
          tmdb_id: m.tmdb_id,
          type: m.type,
        });
      }
      if (!likeKeys.has(key)) {
        violations.push({
          type: 'MATCH_WITHOUT_LIKE',
          message: `Match exists for (tmdb_id=${m.tmdb_id}, type=${m.type}) but no LIKE swipe found`,
          matchId: m.id,
          tmdb_id: m.tmdb_id,
          type: m.type,
        });
      }
    }

    // Violation 2: Like swipe but no match (informational, not wrong for display)
    for (const s of likes) {
      const key = `${s.tmdb_id}-${s.type}`;
      const hasMatch = userMatches.some((m) => m.tmdb_id === s.tmdb_id && m.type === s.type);
      if (!hasMatch) {
        violations.push({
          type: 'LIKE_WITHOUT_MATCH',
          message: `User liked (tmdb_id=${s.tmdb_id}, type=${s.type}) but no match row`,
          tmdb_id: s.tmdb_id,
          type: s.type,
        });
      }
    }

    if (violations.length > 0) {
      totalViolations += violations.length;
      log(`--- User ${userId} ---`);
      log(`  Swipes: ${userSwipes.length} (likes: ${likes.length}, passes: ${passes.length})`);
      log(`  Matches: ${userMatches.length}`);
      for (const v of violations) {
        log(`  VIOLATION [${v.type}]: ${v.message}`);
      }
      log('');
    }
  }

  log('============================================================');
  if (totalViolations === 0) {
    log('Result: No violations found. Invariant holds.');
  } else {
    log(`Result: ${totalViolations} violation(s) found. See above.`);
  }

  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log('\nReport written to: ' + reportPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
