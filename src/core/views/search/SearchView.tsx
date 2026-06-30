'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  TextField,
  InputAdornment,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Button,
  alpha,
  useTheme,
} from '@mui/material';
import { Search as SearchIcon, AccessTime, Article, TrendingUp, Clear } from '@mui/icons-material';
import { format } from 'date-fns';
import Link from '@/components/common/Link';

interface SearchResult {
  id: string;
  type: 'post' | 'page';
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  relevance: number;
}

export default function SearchPageClient() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [popularSearches, setPopularSearches] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(!!initialQuery);
  const suggestionsFetched = useRef(false);

  // Fetch popular searches on mount (with deduplication for Strict Mode)
  useEffect(() => {
    if (suggestionsFetched.current) return;
    suggestionsFetched.current = true;

    fetch('/api/search?suggestions=true&limit=8')
      .then((res) => res.json())
      .then((data) => setPopularSearches(data.suggestions || []))
      .catch(() => {});
  }, []);

  // Perform search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=20`);
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search on initial load if query exists
  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  // Handle search submit
  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
      performSearch(query);
    }
  };

  // Handle clicking a popular search
  const handlePopularSearch = (term: string) => {
    setQuery(term);
    router.push(`/search?q=${encodeURIComponent(term)}`);
    performSearch(term);
  };

  // Clear search
  const handleClear = () => {
    setQuery('');
    setResults([]);
    setTotal(0);
    setHasSearched(false);
    router.push('/search');
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <Typography
          variant="h2"
          fontWeight={800}
          sx={{
            mb: 2,
            background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Search
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Find articles, tutorials, and more
        </Typography>
      </Box>

      {/* Search Input */}
      <Box component="form" onSubmit={handleSearch} sx={{ mb: 4 }}>
        <TextField
          fullWidth
          placeholder="Search for articles, topics, tags..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          variant="outlined"
          size="medium"
          autoFocus
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: 'background.paper',
              '&:hover': {
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main',
                },
              },
            },
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: query && (
                <InputAdornment position="end">
                  <Button size="small" onClick={handleClear} sx={{ minWidth: 'auto', p: 0.5 }}>
                    <Clear />
                  </Button>
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      {/* Popular Searches (show when no search) */}
      {!hasSearched && popularSearches.length > 0 && (
        <Box sx={{ mb: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TrendingUp sx={{ color: 'text.secondary' }} />
            <Typography variant="subtitle2" color="text.secondary">
              Popular Searches
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {popularSearches.map((term) => (
              <Chip
                key={term}
                label={term}
                onClick={() => handlePopularSearch(term)}
                clickable
                sx={{
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.15),
                  },
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent>
                <Skeleton width="60%" height={32} />
                <Skeleton width="100%" />
                <Skeleton width="80%" />
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Results */}
      {!loading && hasSearched && (
        <>
          {/* Results count */}
          <Box sx={{ mb: 3 }}>
            <Typography color="text.secondary">
              {total === 0 ? (
                <>No results found for &quot;{initialQuery}&quot;</>
              ) : (
                <>
                  Found {total} result{total !== 1 ? 's' : ''} for &quot;{initialQuery}&quot;
                </>
              )}
            </Typography>
          </Box>

          {/* Results list */}
          {results.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {results.map((result) => (
                <Card
                  key={result.id}
                  component={Link}
                  href={`/blog/${result.slug}`}
                  sx={{
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: 4,
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          bgcolor: alpha(theme.palette.primary.main, 0.1),
                          color: 'primary.main',
                        }}
                      >
                        <Article />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                          {result.title}
                        </Typography>
                        {result.excerpt && (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              mb: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {result.excerpt}
                          </Typography>
                        )}
                        {result.publishedAt && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {format(new Date(result.publishedAt), 'MMM d, yyyy')}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 6 }}>
                <SearchIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  No results found
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                  Try searching for something else or check out popular searches above.
                </Typography>
                <Button variant="outlined" onClick={handleClear}>
                  Clear Search
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Keyboard shortcut hint */}
      {!hasSearched && (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="body2" color="text.secondary">
            Tip: Press{' '}
            <Box
              component="kbd"
              sx={{
                px: 1,
                py: 0.5,
                borderRadius: 1,
                bgcolor: 'action.hover',
                fontFamily: 'monospace',
              }}
            >
              ⌘
            </Box>{' '}
            <Box
              component="kbd"
              sx={{
                px: 1,
                py: 0.5,
                borderRadius: 1,
                bgcolor: 'action.hover',
                fontFamily: 'monospace',
              }}
            >
              K
            </Box>{' '}
            anywhere to open quick search
          </Typography>
        </Box>
      )}
    </Container>
  );
}
