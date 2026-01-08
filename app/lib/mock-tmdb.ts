/**
 * Mock TMDB service for testing the swipe feature
 * Replace this with actual TMDB API integration later
 */

export interface MockTitle {
  id: number; // tmdb_id
  title: string;
  original_title?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string; // for movies
  first_air_date?: string; // for TV
  vote_average: number;
  vote_count: number;
  popularity: number;
  type: 'movie' | 'tv';
  genre_ids: number[];
}

// Mock movie data
const mockMovies: MockTitle[] = [
  {
    id: 550,
    title: 'Fight Club',
    overview: 'A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.',
    poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    backdrop_path: '/hZkgoQYus5vegHoetLkCJzb17zJ.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    vote_count: 25000,
    popularity: 65.5,
    type: 'movie',
    genre_ids: [18],
  },
  {
    id: 13,
    title: 'Forrest Gump',
    overview: 'A man with a low IQ has accomplished great things in his life and been present during significant historic events.',
    poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',
    backdrop_path: '/Adrip2Jqzw56KeuV2nAxucKMNXA.jpg',
    release_date: '1994-06-23',
    vote_average: 8.5,
    vote_count: 28000,
    popularity: 70.2,
    type: 'movie',
    genre_ids: [35, 18, 10749],
  },
  {
    id: 278,
    title: 'The Shawshank Redemption',
    overview: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.',
    poster_path: '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
    backdrop_path: '/iNh3BivHyg5sQRPP1KOkzguEX0H.jpg',
    release_date: '1994-09-23',
    vote_average: 9.3,
    vote_count: 30000,
    popularity: 85.3,
    type: 'movie',
    genre_ids: [18, 80],
  },
  {
    id: 238,
    title: 'The Godfather',
    overview: 'The aging patriarch of an organized crime dynasty transfers control to his reluctant son.',
    poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    backdrop_path: '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg',
    release_date: '1972-03-24',
    vote_average: 9.2,
    vote_count: 27000,
    popularity: 80.1,
    type: 'movie',
    genre_ids: [18, 80],
  },
  {
    id: 424,
    title: 'Schindler\'s List',
    overview: 'In German-occupied Poland, Oskar Schindler gradually becomes concerned for his Jewish workforce.',
    poster_path: '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg',
    backdrop_path: '/sra8ZjOSAiZ3lqAoRXVIvuYKKjq.jpg',
    release_date: '1993-11-30',
    vote_average: 8.9,
    vote_count: 16000,
    popularity: 65.8,
    type: 'movie',
    genre_ids: [18, 36, 10752],
  },
];

// Mock TV data
const mockTV: MockTitle[] = [
  {
    id: 1396,
    title: 'Breaking Bad',
    overview: 'A high school chemistry teacher diagnosed with cancer turns to manufacturing and selling methamphetamine.',
    poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    first_air_date: '2008-01-20',
    vote_average: 9.5,
    vote_count: 12000,
    popularity: 90.5,
    type: 'tv',
    genre_ids: [18, 80],
  },
  {
    id: 1399,
    title: 'Game of Thrones',
    overview: 'Nine noble families fight for control over the lands of Westeros.',
    poster_path: '/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg',
    backdrop_path: '/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg',
    first_air_date: '2011-04-17',
    vote_average: 8.5,
    vote_count: 25000,
    popularity: 95.2,
    type: 'tv',
    genre_ids: [18, 14, 10759],
  },
  {
    id: 1668,
    title: 'Friends',
    overview: 'Follows the personal and professional lives of six twenty to thirty-something-year-old friends living in Manhattan.',
    poster_path: '/f496cm9enuEsZkSPzCwnTESEK5s.jpg',
    backdrop_path: '/w2nFlcJ2XmcRQXu7VFCnkr2M1q8.jpg',
    first_air_date: '1994-09-22',
    vote_average: 8.8,
    vote_count: 18000,
    popularity: 88.3,
    type: 'tv',
    genre_ids: [35],
  },
];

export const mockTMDB = {
  /**
   * Get a batch of titles based on filters
   * This is a mock - replace with actual TMDB API call
   */
  async getTitles(options: {
    type?: 'movie' | 'tv' | 'both';
    genreIds?: number[];
    providerIds?: string[];
    page?: number;
    limit?: number;
  }): Promise<MockTitle[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    let titles: MockTitle[] = [];

    // Filter by type
    if (options.type === 'movie' || options.type === 'both' || !options.type) {
      titles = [...titles, ...mockMovies];
    }
    if (options.type === 'tv' || options.type === 'both' || !options.type) {
      titles = [...titles, ...mockTV];
    }

    // Filter by genres if provided
    if (options.genreIds && options.genreIds.length > 0) {
      titles = titles.filter(title =>
        title.genre_ids.some(id => options.genreIds!.includes(id))
      );
    }

    // Limit results
    const limit = options.limit || 20;
    const page = options.page || 1;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return titles.slice(startIndex, endIndex);
  },

  /**
   * Get image URL (mock - TMDB uses base URL + path)
   */
  getImageUrl(path: string | null, size: 'w200' | 'w500' | 'original' = 'w500'): string | null {
    if (!path) return null;
    // In real implementation: return `https://image.tmdb.org/t/p/${size}${path}`;
    return `https://image.tmdb.org/t/p/${size}${path}`;
  },
};

