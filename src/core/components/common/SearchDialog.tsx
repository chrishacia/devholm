'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  Box,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Chip,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Search as SearchIcon,
  Article,
  Home,
  Person,
  ContactMail,
  Work,
  Code,
  CalendarToday,
  ArrowForward,
} from '@mui/icons-material';
import { format } from 'date-fns';

interface SearchResult {
  id: string;
  type: 'post' | 'page';
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
}

// Quick links for navigation
const quickLinks = [
  { title: 'Home', href: '/', icon: <Home /> },
  { title: 'About', href: '/about', icon: <Person /> },
  { title: 'Blog', href: '/blog', icon: <Article /> },
  { title: 'Projects', href: '/projects', icon: <Work /> },
  { title: 'Resume', href: '/resume', icon: <Code /> },
  { title: 'Contact', href: '/contact', icon: <ContactMail /> },
  { title: 'Now', href: '/now', icon: <CalendarToday /> },
];

export default function SearchDialog() {
  const theme = useTheme();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Handle keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      // Escape to close
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Search debouncing
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`);
        const data = await res.json();
        setResults(data.results || []);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Get items to display
  const displayItems =
    query.length >= 2
      ? results.map((r) => ({
          id: r.id,
          title: r.title,
          subtitle: r.publishedAt ? format(new Date(r.publishedAt), 'MMM d, yyyy') : undefined,
          href: `/blog/${r.slug}`,
          icon: <Article />,
          type: 'result' as const,
        }))
      : quickLinks
          .filter((link) => link.title.toLowerCase().includes(query.toLowerCase()))
          .map((link) => ({
            id: link.href,
            title: link.title,
            subtitle: 'Quick link',
            href: link.href,
            icon: link.icon,
            type: 'link' as const,
          }));

  // Handle navigation
  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, displayItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && displayItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(displayItems[selectedIndex].href);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          position: 'fixed',
          top: '15%',
          m: 0,
          borderRadius: 2,
          bgcolor: 'background.paper',
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          placeholder="Search or type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="standard"
          slotProps={{
            input: {
              disableUnderline: true,
              startAdornment: (
                <InputAdornment position="start">
                  {loading ? (
                    <CircularProgress size={20} />
                  ) : (
                    <SearchIcon sx={{ color: 'text.secondary' }} />
                  )}
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Chip
                    label="ESC"
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: '0.75rem',
                      bgcolor: 'action.hover',
                    }}
                  />
                </InputAdornment>
              ),
              sx: { fontSize: '1.1rem', py: 1 },
            },
          }}
        />
      </Box>

      <Divider />

      <List sx={{ py: 1, maxHeight: 400, overflow: 'auto' }}>
        {displayItems.length === 0 && query.length >= 2 && !loading ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No results found for &quot;{query}&quot;</Typography>
          </Box>
        ) : displayItems.length === 0 && query.length < 2 ? (
          <>
            <Typography
              variant="overline"
              sx={{ px: 2, py: 1, display: 'block', color: 'text.secondary' }}
            >
              Quick Links
            </Typography>
            {quickLinks.map((link, index) => (
              <ListItem key={link.href} disablePadding>
                <ListItemButton
                  selected={selectedIndex === index}
                  onClick={() => handleSelect(link.href)}
                  sx={{
                    py: 1,
                    '&.Mui-selected': {
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>{link.icon}</ListItemIcon>
                  <ListItemText primary={link.title} primaryTypographyProps={{ fontWeight: 500 }} />
                  <ArrowForward sx={{ color: 'text.secondary', fontSize: 18 }} />
                </ListItemButton>
              </ListItem>
            ))}
          </>
        ) : (
          <>
            {query.length >= 2 && results.length > 0 && (
              <Typography
                variant="overline"
                sx={{ px: 2, py: 1, display: 'block', color: 'text.secondary' }}
              >
                Search Results
              </Typography>
            )}
            {displayItems.map((item, index) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton
                  selected={selectedIndex === index}
                  onClick={() => handleSelect(item.href)}
                  sx={{
                    py: 1.5,
                    '&.Mui-selected': {
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.title}
                    secondary={item.subtitle}
                    primaryTypographyProps={{ fontWeight: 500 }}
                  />
                  <ArrowForward sx={{ color: 'text.secondary', fontSize: 18 }} />
                </ListItemButton>
              </ListItem>
            ))}
          </>
        )}
      </List>

      <Divider />

      <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip label="↑↓" size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
            <Typography variant="caption" color="text.secondary">
              Navigate
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip label="↵" size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
            <Typography variant="caption" color="text.secondary">
              Select
            </Typography>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary">
          ⌘K to search
        </Typography>
      </Box>
    </Dialog>
  );
}
