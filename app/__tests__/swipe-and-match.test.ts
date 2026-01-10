/**
 * Integration tests for the swiping and match system
 * 
 * These tests simulate a full user swipe-through experience:
 * 1. Create a test user
 * 2. Swipe through all available test titles (movies + TV shows)
 * 3. Verify matches contain only liked titles with correct data
 * 4. Verify passes are NOT in matches
 */

// Use test-friendly Supabase client that doesn't require React Native dependencies
import { testSupabase } from './test-supabase-client';
import type { MockTitle } from '../lib/mock-tmdb';

const supabase = testSupabase;

// Test data from mock-tmdb.ts
const ALL_TEST_TITLES: MockTitle[] = [
  // Movies
  { id: 550, title: 'Fight Club', type: 'movie', overview: 'A ticking-time-bomb insomniac...', poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', backdrop_path: '/hZkgoQYus5vegHoetLkCJzb17zJ.jpg', release_date: '1999-10-15', vote_average: 8.4, vote_count: 25000, popularity: 65.5, genre_ids: [18] },
  { id: 13, title: 'Forrest Gump', type: 'movie', overview: 'A man with a low IQ...', poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg', backdrop_path: '/Adrip2Jqzw56KeuV2nAxucKMNXA.jpg', release_date: '1994-06-23', vote_average: 8.5, vote_count: 28000, popularity: 70.2, genre_ids: [35, 18, 10749] },
  { id: 278, title: 'The Shawshank Redemption', type: 'movie', overview: 'Two imprisoned men bond...', poster_path: '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', backdrop_path: '/iNh3BivHyg5sQRPP1KOkzguEX0H.jpg', release_date: '1994-09-23', vote_average: 9.3, vote_count: 30000, popularity: 85.3, genre_ids: [18, 80] },
  { id: 238, title: 'The Godfather', type: 'movie', overview: 'The aging patriarch...', poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', backdrop_path: '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg', release_date: '1972-03-24', vote_average: 9.2, vote_count: 27000, popularity: 80.1, genre_ids: [18, 80] },
  { id: 424, title: 'Schindler\'s List', type: 'movie', overview: 'In German-occupied Poland...', poster_path: '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg', backdrop_path: '/sra8ZjOSAiZ3lqAoRXVIvuYKKjq.jpg', release_date: '1993-11-30', vote_average: 8.9, vote_count: 16000, popularity: 65.8, genre_ids: [18, 36, 10752] },
  // TV Shows
  { id: 1396, title: 'Breaking Bad', type: 'tv', overview: 'A high school chemistry teacher...', poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg', first_air_date: '2008-01-20', vote_average: 9.5, vote_count: 12000, popularity: 90.5, genre_ids: [18, 80] },
  { id: 1399, title: 'Game of Thrones', type: 'tv', overview: 'Nine noble families fight...', poster_path: '/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg', backdrop_path: '/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg', first_air_date: '2011-04-17', vote_average: 8.5, vote_count: 25000, popularity: 95.2, genre_ids: [18, 14, 10759] },
  { id: 1668, title: 'Friends', type: 'tv', overview: 'Follows the personal and professional lives...', poster_path: '/f496cm9enuEsZkSPzCwnTESEK5s.jpg', backdrop_path: '/w2nFlcJ2XmcRQXu7VFCnkr2M1q8.jpg', first_air_date: '1994-09-22', vote_average: 8.8, vote_count: 18000, popularity: 88.3, genre_ids: [35] },
];

// Define which titles we'll like vs pass
// This simulates a realistic user swipe pattern
const SWIPE_DECISIONS: Record<string, 'like' | 'pass'> = {
  // Movies - like some, pass on others
  'movie-550': 'like',   // Fight Club - LIKE
  'movie-13': 'pass',    // Forrest Gump - PASS
  'movie-278': 'like',   // Shawshank - LIKE
  'movie-238': 'like',   // Godfather - LIKE
  'movie-424': 'pass',   // Schindler's List - PASS
  // TV Shows
  'tv-1396': 'like',     // Breaking Bad - LIKE
  'tv-1399': 'pass',     // Game of Thrones - PASS
  'tv-1668': 'like',     // Friends - LIKE
};

// Expected liked titles (should appear in matches)
const EXPECTED_LIKED_TITLES = ALL_TEST_TITLES.filter(
  title => SWIPE_DECISIONS[`${title.type}-${title.id}`] === 'like'
);

// Expected passed titles (should NOT appear in matches)
const EXPECTED_PASSED_TITLES = ALL_TEST_TITLES.filter(
  title => SWIPE_DECISIONS[`${title.type}-${title.id}`] === 'pass'
);

describe('Swipe and Match System Integration Tests', () => {
  let testUserId: string;
  let testUserEmail: string;
  let testUserPassword: string;

  beforeAll(async () => {
    // Ensure Supabase is running and accessible
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Cannot connect to Supabase: ${error.message}. Make sure it's running (supabase start)`);
    }
  });

  beforeEach(async () => {
    // Create a unique test user for each test
    testUserEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
    testUserPassword = 'TestPassword123!';

    // Sign up a new user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testUserEmail,
      password: testUserPassword,
    });

    if (signUpError || !signUpData.user) {
      throw new Error(`Failed to create test user: ${signUpError?.message || 'Unknown error'}`);
    }

    testUserId = signUpData.user.id;

    // Wait a bit for profile to be created (trigger might take a moment)
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    // Clean up: Delete test user's data
    if (testUserId) {
      try {
        // Delete all user data (swipes, matches, etc.)
        await supabase.from('swipes').delete().eq('user_id', testUserId);
        await supabase.from('matches').delete().eq('user_id', testUserId);
        await supabase.from('titles').delete(); // Clean up test titles
        await supabase.auth.signOut();
      } catch (error: any) {
        console.warn('Cleanup warning:', error?.message || error);
      }
    }
  });

  describe('Full Swipe Through Simulation', () => {
    it('should correctly process all swipes and create matches only for likes', async () => {
      // Step 1: Cache all titles first (simulate what happens during swipe)
      console.log('📦 Caching all titles...');
      for (const title of ALL_TEST_TITLES) {
        const { error } = await supabase.rpc('upsert_title', {
          p_tmdb_id: title.id,
          p_type: title.type,
          p_title: title.title,
          p_original_title: title.original_title || null,
          p_poster_path: title.poster_path,
          p_backdrop_path: title.backdrop_path,
          p_overview: title.overview,
          p_release_date: title.release_date || null,
          p_first_air_date: title.first_air_date || null,
          p_popularity: title.popularity,
          p_vote_average: title.vote_average,
          p_vote_count: title.vote_count,
          p_adult: false,
          p_metadata: { genre_ids: title.genre_ids },
        });
        if (error) throw error;
      }

      // Step 2: Simulate swiping through all titles
      console.log('👆 Simulating swipes...');
      const swipeResults = [];
      for (const title of ALL_TEST_TITLES) {
        const decision = SWIPE_DECISIONS[`${title.type}-${title.id}`];
        if (!decision) {
          throw new Error(`Missing decision for ${title.type}-${title.id}`);
        }

        const { data: swipe, error } = await supabase
          .from('swipes')
          .insert({
            user_id: testUserId,
            tmdb_id: title.id,
            type: title.type,
            decision,
          })
          .select()
          .single();

        if (error) throw error;

        swipeResults.push({ title, decision, swipe });
        console.log(`  ${decision.toUpperCase()}: ${title.title} (${title.type})`);
      }

      // Verify all swipes were created
      expect(swipeResults.length).toBe(ALL_TEST_TITLES.length);

      // Count likes and passes
      const likesCreated = swipeResults.filter(r => r.decision === 'like').length;
      const passesCreated = swipeResults.filter(r => r.decision === 'pass').length;
      console.log(`\n✅ Created ${likesCreated} likes and ${passesCreated} passes`);

      expect(likesCreated).toBe(EXPECTED_LIKED_TITLES.length);
      expect(passesCreated).toBe(EXPECTED_PASSED_TITLES.length);

      // Step 3: Sync matches from swipes
      console.log('\n🔄 Syncing matches from swipes...');
      const { data: syncCount, error: syncError } = await supabase.rpc('sync_matches_from_swipes', {
        p_user_id: testUserId,
      });
      if (syncError) throw syncError;
      console.log(`  Synced ${syncCount} new matches`);

      // Step 4: Get all matches with titles
      const { data: matches, error: matchesError } = await supabase
        .from('matches_with_titles')
        .select('*')
        .eq('user_id', testUserId)
        .order('created_at', { ascending: false });

      if (matchesError) throw matchesError;
      console.log(`\n📋 Found ${matches?.length || 0} matches in database`);

      // Step 5: Verify matches contain ONLY liked titles
      expect(matches?.length).toBe(EXPECTED_LIKED_TITLES.length);
      expect(matches?.length).toBe(likesCreated);

      // Step 6: Verify each liked title appears in matches
      for (const expectedTitle of EXPECTED_LIKED_TITLES) {
        const match = matches?.find(
          (m: any) => m.tmdb_id === expectedTitle.id && m.type === expectedTitle.type
        );

        expect(match).toBeDefined();
        expect(match?.tmdb_id).toBe(expectedTitle.id);
        expect(match?.type).toBe(expectedTitle.type);
        expect(match?.user_id).toBe(testUserId);
        expect(match?.watched).toBe(false); // Default value

        // Verify title data is correctly joined
        expect(match?.title).toBe(expectedTitle.title);
        expect(match?.overview).toBe(expectedTitle.overview);
        expect(match?.poster_path).toBe(expectedTitle.poster_path);
        expect(match?.vote_average).toBe(expectedTitle.vote_average);

        // Verify type-specific fields
        if (expectedTitle.type === 'movie') {
          expect(match?.release_date).toBe(expectedTitle.release_date);
        } else {
          expect(match?.first_air_date).toBe(expectedTitle.first_air_date);
        }
      }

      console.log(`\n✅ All ${matches?.length} liked titles correctly appear in matches`);

      // Step 7: Verify NO passed titles appear in matches
      for (const passedTitle of EXPECTED_PASSED_TITLES) {
        const match = matches?.find(
          (m: any) => m.tmdb_id === passedTitle.id && m.type === passedTitle.type
        );
        expect(match).toBeUndefined();
      }

      console.log(`✅ Confirmed ${EXPECTED_PASSED_TITLES.length} passed titles do NOT appear in matches`);

      // Step 8: Verify all swipes exist in database
      const { data: allSwipes, error: swipesError } = await supabase
        .from('swipes')
        .select('*')
        .eq('user_id', testUserId);

      if (swipesError) throw swipesError;
      expect(allSwipes?.length).toBe(ALL_TEST_TITLES.length);

      // Verify decision distribution
      const likesInDb = allSwipes?.filter((s: any) => s.decision === 'like').length;
      const passesInDb = allSwipes?.filter((s: any) => s.decision === 'pass').length;
      expect(likesInDb).toBe(likesCreated);
      expect(passesInDb).toBe(passesCreated);

      console.log('\n🎉 All tests passed!');
    }, 30000); // 30 second timeout for integration test

    it('should handle duplicate swipes gracefully', async () => {
      // Try to swipe the same title twice - should fail or be ignored
      const title = ALL_TEST_TITLES[0];

      // Cache title
      await supabase.rpc('upsert_title', {
        p_tmdb_id: title.id,
        p_type: title.type,
        p_title: title.title,
        p_overview: title.overview,
        p_poster_path: title.poster_path,
        p_vote_average: title.vote_average,
        p_vote_count: title.vote_count,
        p_popularity: title.popularity,
        p_adult: false,
      });

      // First swipe - should succeed
      const { error: firstError } = await supabase
        .from('swipes')
        .insert({
          user_id: testUserId,
          tmdb_id: title.id,
          type: title.type,
          decision: 'like',
        });
      expect(firstError).toBeNull();

      // Second swipe on same title - should fail due to unique constraint
      const { error: secondError } = await supabase
        .from('swipes')
        .insert({
          user_id: testUserId,
          tmdb_id: title.id,
          type: title.type,
          decision: 'pass', // Try to change decision
        });
      expect(secondError).not.toBeNull();
      expect(secondError?.code).toBe('23505'); // Unique violation

      // Verify only one swipe exists
      const { data: swipes } = await supabase
        .from('swipes')
        .select('*')
        .eq('user_id', testUserId);
      expect(swipes?.length).toBe(1);
      expect(swipes?.[0].decision).toBe('like'); // Should be the first decision
    });

    it('should sync matches correctly after multiple likes', async () => {
      // Cache and like multiple titles
      const titlesToLike = ALL_TEST_TITLES.slice(0, 3);

      for (const title of titlesToLike) {
        await supabase.rpc('upsert_title', {
          p_tmdb_id: title.id,
          p_type: title.type,
          p_title: title.title,
          p_overview: title.overview,
          p_poster_path: title.poster_path,
          p_vote_average: title.vote_average,
          p_vote_count: title.vote_count,
          p_popularity: title.popularity,
          p_adult: false,
        });

        await supabase.from('swipes').insert({
          user_id: testUserId,
          tmdb_id: title.id,
          type: title.type,
          decision: 'like',
        });
      }

      // Sync matches
      const { data: syncCount } = await supabase.rpc('sync_matches_from_swipes', {
        p_user_id: testUserId,
      });
      expect(syncCount).toBe(titlesToLike.length);

      // Verify matches
      const { data: matches } = await supabase
        .from('matches_with_titles')
        .select('*')
        .eq('user_id', testUserId);
      expect(matches?.length).toBe(titlesToLike.length);

      // Sync again - should not create duplicates
      const { data: syncCount2 } = await supabase.rpc('sync_matches_from_swipes', {
        p_user_id: testUserId,
      });
      expect(syncCount2).toBe(0); // No new matches

      const { data: matches2 } = await supabase
        .from('matches_with_titles')
        .select('*')
        .eq('user_id', testUserId);
      expect(matches2?.length).toBe(titlesToLike.length); // Still same count
    });
  });
});
