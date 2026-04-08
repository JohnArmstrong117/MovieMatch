/**
 * Single list of genres for user preferences. TMDB uses different IDs for movie vs TV;
 * each unified row maps to the correct discover `with_genres` IDs per medium.
 */
export type UnifiedGenre = {
  slug: string;
  label: string;
  /** TMDB movie discover genre IDs (empty = no movie discover filter for this chip alone) */
  movieGenreIds: number[];
  /** TMDB TV discover genre IDs */
  tvGenreIds: number[];
};

export const UNIFIED_GENRES: UnifiedGenre[] = [
  { slug: 'action', label: 'Action', movieGenreIds: [28], tvGenreIds: [10759] },
  { slug: 'adventure', label: 'Adventure', movieGenreIds: [12], tvGenreIds: [10759] },
  { slug: 'animation', label: 'Animation', movieGenreIds: [16], tvGenreIds: [16] },
  { slug: 'comedy', label: 'Comedy', movieGenreIds: [35], tvGenreIds: [35] },
  { slug: 'crime', label: 'Crime', movieGenreIds: [80], tvGenreIds: [80] },
  { slug: 'documentary', label: 'Documentary', movieGenreIds: [99], tvGenreIds: [99] },
  { slug: 'drama', label: 'Drama', movieGenreIds: [18], tvGenreIds: [18] },
  { slug: 'family', label: 'Family', movieGenreIds: [10751], tvGenreIds: [10751] },
  { slug: 'kids', label: 'Kids', movieGenreIds: [10751], tvGenreIds: [10762] },
  { slug: 'sci_fi', label: 'Science Fiction', movieGenreIds: [878], tvGenreIds: [10765] },
  { slug: 'fantasy', label: 'Fantasy', movieGenreIds: [14], tvGenreIds: [10765] },
  { slug: 'history', label: 'History', movieGenreIds: [36], tvGenreIds: [] },
  { slug: 'horror', label: 'Horror', movieGenreIds: [27], tvGenreIds: [] },
  { slug: 'music', label: 'Music', movieGenreIds: [10402], tvGenreIds: [] },
  { slug: 'mystery', label: 'Mystery', movieGenreIds: [9648], tvGenreIds: [9648] },
  { slug: 'romance', label: 'Romance', movieGenreIds: [10749], tvGenreIds: [] },
  { slug: 'thriller', label: 'Thriller', movieGenreIds: [53], tvGenreIds: [] },
  {
    slug: 'war_politics',
    label: 'War & Politics',
    movieGenreIds: [10752],
    tvGenreIds: [10768],
  },
  { slug: 'western', label: 'Western', movieGenreIds: [37], tvGenreIds: [37] },
  { slug: 'news', label: 'News', movieGenreIds: [], tvGenreIds: [10763] },
  { slug: 'reality', label: 'Reality', movieGenreIds: [], tvGenreIds: [10764] },
  { slug: 'soap', label: 'Soap', movieGenreIds: [], tvGenreIds: [10766] },
  { slug: 'talk', label: 'Talk', movieGenreIds: [], tvGenreIds: [10767] },
  { slug: 'tv_movie', label: 'TV Movie', movieGenreIds: [10770], tvGenreIds: [] },
];

/** Alphabetical label order for preference chips */
export const UNIFIED_GENRES_SORTED = [...UNIFIED_GENRES].sort((a, b) =>
  a.label.localeCompare(b.label)
);

const bySlug = new Map(UNIFIED_GENRES.map((g) => [g.slug, g]));

export const UNIFIED_GENRE_SLUGS = new Set(UNIFIED_GENRES.map((g) => g.slug));

/** Legacy slugs from initial unified-genre rollout. */
const LEGACY_UNIFIED_SLUG_ALIASES: Record<string, string[]> = {
  action_adventure: ['action', 'adventure'],
  sci_fi_fantasy: ['sci_fi', 'fantasy'],
};

export function normalizeUnifiedSlugs(slugs: string[]): string[] {
  const out = new Set<string>();
  for (const slug of slugs) {
    if (!slug) continue;
    const aliases = LEGACY_UNIFIED_SLUG_ALIASES[slug];
    if (aliases) {
      for (const alias of aliases) out.add(alias);
      continue;
    }
    if (UNIFIED_GENRE_SLUGS.has(slug)) out.add(slug);
  }
  return Array.from(out);
}

export function getUnifiedGenreBySlug(slug: string): UnifiedGenre | undefined {
  return bySlug.get(slug);
}

/** Unique TMDB genre IDs to query for discover (one request per ID). */
export function expandUnifiedSlugsForFeed(
  slugs: string[],
  feedType: 'movie' | 'tv'
): number[] {
  const set = new Set<number>();
  for (const slug of normalizeUnifiedSlugs(slugs)) {
    const g = bySlug.get(slug);
    if (!g) continue;
    const ids = feedType === 'tv' ? g.tvGenreIds : g.movieGenreIds;
    for (const id of ids) set.add(id);
  }
  return Array.from(set);
}

/**
 * Map legacy TMDB movie genre_id (from old user_genres) → unified slug.
 * 10751 is only "Family" in TMDB movies; "Kids" is TV-only in TMDB.
 */
export const LEGACY_MOVIE_GENRE_ID_TO_SLUG: Record<number, string> = {
  28: 'action',
  12: 'adventure',
  16: 'animation',
  35: 'comedy',
  80: 'crime',
  99: 'documentary',
  18: 'drama',
  10751: 'family',
  14: 'fantasy',
  878: 'sci_fi',
  36: 'history',
  27: 'horror',
  10402: 'music',
  9648: 'mystery',
  10749: 'romance',
  53: 'thriller',
  10752: 'war_politics',
  37: 'western',
  10770: 'tv_movie',
};

export function slugsFromLegacyMovieGenreIds(genreIds: number[]): string[] {
  const out = new Set<string>();
  for (const id of genreIds) {
    const slug = LEGACY_MOVIE_GENRE_ID_TO_SLUG[id];
    if (slug) out.add(slug);
  }
  return Array.from(out);
}

/** Fill display names for TV-only TMDB genre IDs (and composite labels) on swipe cards. */
export function mergeTvGenreLabelsIntoMap(map: Map<number, string>): void {
  map.set(10759, 'Action & Adventure');
  map.set(10765, 'Sci-Fi & Fantasy');
  map.set(10762, 'Kids');
  map.set(10763, 'News');
  map.set(10764, 'Reality');
  map.set(10766, 'Soap');
  map.set(10767, 'Talk');
  map.set(10768, 'War & Politics');
}
