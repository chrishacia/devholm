'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  Grid2 as Grid,
  Chip,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
} from '@mui/material';
import {
  ArrowBack,
  Save,
  Visibility,
  Image as ImageIcon,
  Code,
  FormatBold,
  FormatItalic,
  Link as LinkIcon,
  FormatListBulleted,
  FormatListNumbered,
  Title,
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import Link from '@/components/common/Link';
import { MediaBrowser } from '@/components';

// Available tags (would come from API)
const availableTags = [
  'Next.js',
  'React',
  'TypeScript',
  'JavaScript',
  'Node.js',
  'DevOps',
  'Docker',
  'Best Practices',
  'Tutorial',
  'Career',
];

interface PostForm {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: 'draft' | 'published' | 'scheduled';
  publishedAt: Date | null;
  tags: string[];
  coverImage: string | null;
  metaTitle: string;
  metaDescription: string;
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}

function ToolbarButton({ icon, title, onClick }: ToolbarButtonProps) {
  return (
    <IconButton
      size="small"
      title={title}
      onClick={onClick}
      sx={{
        borderRadius: 1,
        '&:hover': {
          bgcolor: 'action.hover',
        },
      }}
    >
      {icon}
    </IconButton>
  );
}

export default function NewPostPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorTab, setEditorTab] = useState(0);
  const [coverImageBrowserOpen, setCoverImageBrowserOpen] = useState(false);
  const [inlineImageBrowserOpen, setInlineImageBrowserOpen] = useState(false);

  const [form, setForm] = useState<PostForm>({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    status: 'draft',
    publishedAt: null,
    tags: [],
    coverImage: null,
    metaTitle: '',
    metaDescription: '',
  });

  const generateSlug = useCallback((title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setForm((prev) => ({
      ...prev,
      title,
      slug: generateSlug(title),
    }));
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = document.querySelector('textarea[name="content"]') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = form.content.substring(start, end);
    const newContent =
      form.content.substring(0, start) +
      prefix +
      selectedText +
      suffix +
      form.content.substring(end);

    setForm((prev) => ({ ...prev, content: newContent }));

    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      );
    }, 0);
  };

  const handleSave = async (publishStatus?: 'draft' | 'published') => {
    setSaving(true);

    try {
      const status = publishStatus || form.status;

      const response = await fetch('/api/admin/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: form.title,
          slug: form.slug,
          excerpt: form.excerpt,
          content: form.content,
          status,
          publishedAt: form.publishedAt?.toISOString(),
          tags: form.tags,
          coverImage: form.coverImage,
          metaTitle: form.metaTitle,
          metaDescription: form.metaDescription,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create post');
      }

      const newPost = await response.json();

      setSnackbar({
        open: true,
        message: status === 'published' ? 'Post published successfully!' : 'Post saved as draft!',
        severity: 'success',
      });

      // Redirect to the edit page for the new post or to posts list
      if (publishStatus === 'published') {
        router.push('/admin/posts');
      } else {
        router.push(`/admin/posts/${newPost.id}/edit`);
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : 'Failed to save post. Please try again.',
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // Simple markdown to HTML for preview
  const renderPreview = (content: string) => {
    return content
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 4,
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
            <IconButton component={Link} href="/admin/posts" size="small">
              <ArrowBack />
            </IconButton>
            <Box>
              <Typography
                variant="h4"
                fontWeight={700}
                sx={{ fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' } }}
              >
                New Post
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ display: { xs: 'none', sm: 'block' } }}
              >
                Create a new blog post
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<Visibility />}
              onClick={() => setPreviewOpen(true)}
              size="small"
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              Preview
            </Button>
            <Button
              variant="outlined"
              startIcon={<Save />}
              onClick={() => handleSave('draft')}
              disabled={saving || !form.title}
              size="small"
            >
              Save Draft
            </Button>
            <Button
              variant="contained"
              onClick={() => handleSave('published')}
              disabled={saving || !form.title || !form.content}
              size="small"
            >
              Publish
            </Button>
          </Box>
        </Box>

        <Grid container spacing={{ xs: 2, sm: 3 }}>
          {/* Main Editor */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Card>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                {/* Title */}
                <TextField
                  fullWidth
                  label="Post Title"
                  placeholder="Enter a compelling title..."
                  value={form.title}
                  onChange={handleTitleChange}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ mb: 2 }}
                />

                {/* Slug */}
                <TextField
                  fullWidth
                  label="URL Slug"
                  value={form.slug}
                  onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                  helperText={`/blog/${form.slug || 'your-post-slug'}`}
                  sx={{ mb: 3 }}
                />

                {/* Excerpt */}
                <TextField
                  fullWidth
                  label="Excerpt"
                  placeholder="Brief description for search results and previews..."
                  value={form.excerpt}
                  onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
                  multiline
                  rows={2}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ mb: 3 }}
                />

                <Divider sx={{ mb: 2 }} />

                {/* Editor Tabs */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                  <Tabs value={editorTab} onChange={(_, v) => setEditorTab(v)}>
                    <Tab label="Write" />
                    <Tab label="Preview" />
                  </Tabs>
                </Box>

                {editorTab === 0 ? (
                  <>
                    {/* Markdown Toolbar */}
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        p: 1,
                        mb: 1,
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      <ToolbarButton
                        icon={<Title sx={{ fontSize: 18 }} />}
                        title="Heading"
                        onClick={() => insertMarkdown('## ')}
                      />
                      <ToolbarButton
                        icon={<FormatBold sx={{ fontSize: 18 }} />}
                        title="Bold"
                        onClick={() => insertMarkdown('**', '**')}
                      />
                      <ToolbarButton
                        icon={<FormatItalic sx={{ fontSize: 18 }} />}
                        title="Italic"
                        onClick={() => insertMarkdown('*', '*')}
                      />
                      <ToolbarButton
                        icon={<Code sx={{ fontSize: 18 }} />}
                        title="Code"
                        onClick={() => insertMarkdown('`', '`')}
                      />
                      <ToolbarButton
                        icon={<LinkIcon sx={{ fontSize: 18 }} />}
                        title="Link"
                        onClick={() => insertMarkdown('[', '](url)')}
                      />
                      <ToolbarButton
                        icon={<FormatListBulleted sx={{ fontSize: 18 }} />}
                        title="Bullet List"
                        onClick={() => insertMarkdown('- ')}
                      />
                      <ToolbarButton
                        icon={<FormatListNumbered sx={{ fontSize: 18 }} />}
                        title="Numbered List"
                        onClick={() => insertMarkdown('1. ')}
                      />
                      <ToolbarButton
                        icon={<ImageIcon sx={{ fontSize: 18 }} />}
                        title="Image"
                        onClick={() => setInlineImageBrowserOpen(true)}
                      />
                    </Box>

                    {/* Content Editor */}
                    <TextField
                      fullWidth
                      name="content"
                      placeholder="Write your content in Markdown..."
                      value={form.content}
                      onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                      multiline
                      rows={20}
                      sx={{
                        '& .MuiInputBase-root': {
                          fontFamily: 'monospace',
                          fontSize: '0.95rem',
                        },
                      }}
                    />
                  </>
                ) : (
                  /* Preview */
                  <Box
                    sx={{
                      p: 3,
                      minHeight: 400,
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                      '& h1, & h2, & h3': { mt: 3, mb: 1 },
                      '& p': { mb: 2 },
                      '& code': {
                        px: 1,
                        py: 0.25,
                        bgcolor: 'action.hover',
                        borderRadius: 0.5,
                        fontFamily: 'monospace',
                        fontSize: '0.9em',
                      },
                      '& a': { color: 'primary.main' },
                      '& ul, & ol': { pl: 3 },
                    }}
                    dangerouslySetInnerHTML={{
                      __html: form.content
                        ? renderPreview(form.content)
                        : '<p style="color: gray;">Start writing to see a preview...</p>',
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Sidebar */}
          <Grid size={{ xs: 12, lg: 4 }}>
            {/* Publish Settings */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  Publish Settings
                </Typography>

                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={form.status}
                    label="Status"
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        status: e.target.value as PostForm['status'],
                      }))
                    }
                  >
                    <MenuItem value="draft">Draft</MenuItem>
                    <MenuItem value="published">Published</MenuItem>
                    <MenuItem value="scheduled">Scheduled</MenuItem>
                  </Select>
                </FormControl>

                {form.status === 'scheduled' && (
                  <DateTimePicker
                    label="Publish Date"
                    value={form.publishedAt}
                    onChange={(date) => setForm((prev) => ({ ...prev, publishedAt: date }))}
                    sx={{ width: '100%' }}
                    minDateTime={new Date()}
                  />
                )}
              </CardContent>
            </Card>

            {/* Tags */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  Tags
                </Typography>

                <Autocomplete
                  multiple
                  freeSolo
                  options={availableTags}
                  value={form.tags}
                  onChange={(_, newValue) => setForm((prev) => ({ ...prev, tags: newValue }))}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip {...getTagProps({ index })} key={option} label={option} size="small" />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField {...params} placeholder="Add tags..." size="small" />
                  )}
                />
              </CardContent>
            </Card>

            {/* Cover Image */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  Cover Image
                </Typography>

                {form.coverImage ? (
                  <Box sx={{ position: 'relative' }}>
                    <Box
                      component="img"
                      src={form.coverImage}
                      alt="Cover image"
                      sx={{
                        width: '100%',
                        borderRadius: 2,
                        maxHeight: 200,
                        objectFit: 'cover',
                      }}
                    />
                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setCoverImageBrowserOpen(true)}
                        fullWidth
                      >
                        Change
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => setForm((prev) => ({ ...prev, coverImage: null }))}
                      >
                        Remove
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Box
                    onClick={() => setCoverImageBrowserOpen(true)}
                    sx={{
                      border: 2,
                      borderStyle: 'dashed',
                      borderColor: 'divider',
                      borderRadius: 2,
                      p: 4,
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                      '&:hover': {
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <ImageIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Click to browse or upload
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* SEO Settings */}
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  SEO Settings
                </Typography>

                <TextField
                  fullWidth
                  label="Meta Title"
                  placeholder={form.title || 'Post title'}
                  value={form.metaTitle}
                  onChange={(e) => setForm((prev) => ({ ...prev, metaTitle: e.target.value }))}
                  helperText={`${form.metaTitle.length}/60 characters`}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  label="Meta Description"
                  placeholder={form.excerpt || 'Post excerpt'}
                  value={form.metaDescription}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, metaDescription: e.target.value }))
                  }
                  multiline
                  rows={3}
                  helperText={`${form.metaDescription.length}/160 characters`}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Full Preview Dialog */}
        <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            <Typography variant="h6">Post Preview</Typography>
          </DialogTitle>
          <DialogContent dividers>
            <Typography variant="h3" gutterBottom>
              {form.title || 'Untitled Post'}
            </Typography>
            {form.tags.length > 0 && (
              <Box sx={{ mb: 2 }}>
                {form.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5 }} />
                ))}
              </Box>
            )}
            <Box
              sx={{
                '& h1, & h2, & h3': { mt: 3, mb: 1 },
                '& p': { mb: 2 },
                '& code': {
                  px: 1,
                  py: 0.25,
                  bgcolor: 'action.hover',
                  borderRadius: 0.5,
                  fontFamily: 'monospace',
                },
              }}
              dangerouslySetInnerHTML={{
                __html: form.content ? renderPreview(form.content) : '<p>No content yet.</p>',
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPreviewOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          <Alert
            severity={snackbar.severity}
            onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>

        {/* Media Browser for Cover Image */}
        <MediaBrowser
          open={coverImageBrowserOpen}
          onClose={() => setCoverImageBrowserOpen(false)}
          onSelect={(asset) => setForm((prev) => ({ ...prev, coverImage: asset.publicUrl }))}
          selectedUrl={form.coverImage}
          acceptedTypes="images"
        />

        {/* Media Browser for Inline Images */}
        <MediaBrowser
          open={inlineImageBrowserOpen}
          onClose={() => setInlineImageBrowserOpen(false)}
          onSelect={(asset) => {
            setInlineImageBrowserOpen(false);
            insertMarkdown(`![${asset.altText || asset.originalFilename}](${asset.publicUrl})`);
          }}
          acceptedTypes="images"
        />
      </Box>
    </LocalizationProvider>
  );
}
