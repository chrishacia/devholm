'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid2 as Grid,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  Skeleton,
  Alert,
  Snackbar,
  LinearProgress,
  Tabs,
  Tab,
  Paper,
  Divider,
} from '@mui/material';
import {
  CloudUpload,
  Search,
  Delete,
  MoreVert,
  Image as ImageIcon,
  PictureAsPdf,
  Description,
  VideoFile,
  AudioFile,
  Inventory2,
  ContentCopy,
  Edit,
  Close,
  CheckCircle,
  FolderOpen,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { SafeImage } from '@/components/common';
import { formatFileSize } from '@/lib/utils';

interface MediaAsset {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  publicUrl: string | null;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

interface MediaStats {
  total: number;
  images: number;
  documents: number;
  videos: number;
  audio: number;
  other: number;
  totalSize: number;
}

// formatFileSize imported from @/lib/utils

// Get icon for file type
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon />;
  if (mimeType === 'application/pdf') return <PictureAsPdf />;
  if (mimeType.startsWith('video/')) return <VideoFile />;
  return <Description />;
}

// MediaCard component
function MediaCard({
  asset,
  selected,
  onSelect,
  onMenuOpen,
  onClick,
}: {
  asset: MediaAsset;
  selected: boolean;
  onSelect: () => void;
  onMenuOpen: (event: React.MouseEvent<HTMLElement>) => void;
  onClick: () => void;
}) {
  const isImage = asset.mimeType.startsWith('image/');

  return (
    <Card
      sx={{
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: selected ? 2 : 1,
        borderColor: selected ? 'primary.main' : 'divider',
        '&:hover': {
          borderColor: selected ? 'primary.main' : 'primary.light',
          transform: 'translateY(-2px)',
          boxShadow: 3,
        },
      }}
      onClick={onClick}
    >
      {/* Selection checkbox */}
      <Checkbox
        checked={selected}
        onChange={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onClick={(e) => e.stopPropagation()}
        sx={{
          position: 'absolute',
          top: 4,
          left: 4,
          zIndex: 2,
          bgcolor: 'background.paper',
          borderRadius: 1,
          '&:hover': { bgcolor: 'background.paper' },
        }}
      />

      {/* Menu button */}
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onMenuOpen(e);
        }}
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 2,
          bgcolor: 'background.paper',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <MoreVert fontSize="small" />
      </IconButton>

      {/* Thumbnail / Preview */}
      <Box
        sx={{
          height: 150,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
          overflow: 'hidden',
        }}
      >
        {isImage && asset.publicUrl ? (
          <SafeImage
            src={asset.publicUrl}
            alt={asset.altText || asset.filename}
            width="100%"
            height="100%"
            objectFit="cover"
            fallbackText="Image unavailable"
          />
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: 'text.secondary',
            }}
          >
            {getFileIcon(asset.mimeType)}
            <Typography variant="caption" sx={{ mt: 1 }}>
              {asset.mimeType.split('/')[1]?.toUpperCase()}
            </Typography>
          </Box>
        )}
      </Box>

      {/* File info */}
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="body2" fontWeight={500} noWrap title={asset.originalFilename}>
          {asset.originalFilename}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {formatFileSize(asset.fileSize)}
          </Typography>
          {asset.width && asset.height && (
            <Typography variant="caption" color="text.secondary">
              {asset.width}×{asset.height}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

// Upload progress component
function UploadProgress({ progress, filename }: { progress: number; filename: string }) {
  return (
    <Paper
      sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" noWrap>
          {filename}
        </Typography>
        <LinearProgress variant="determinate" value={progress} sx={{ mt: 1 }} />
      </Box>
      {progress === 100 && <CheckCircle color="success" />}
    </Paper>
  );
}

// Media detail dialog
function MediaDetailDialog({
  open,
  asset,
  onClose,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  asset: MediaAsset | null;
  onClose: () => void;
  onUpdate: (id: string, data: { altText?: string; caption?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (asset) {
      setAltText(asset.altText || '');
      setCaption(asset.caption || '');
    }
  }, [asset]);

  if (!asset) return null;

  const isImage = asset.mimeType.startsWith('image/');

  const handleCopyUrl = () => {
    if (asset.publicUrl) {
      navigator.clipboard.writeText(asset.publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = () => {
    onUpdate(asset.id, { altText, caption });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Media Details</Typography>
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={3}>
          {/* Preview */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                bgcolor: 'action.hover',
                borderRadius: 2,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 300,
              }}
            >
              {isImage && asset.publicUrl ? (
                <SafeImage
                  src={asset.publicUrl}
                  alt={asset.altText || asset.filename}
                  width="100%"
                  height="auto"
                  objectFit="contain"
                  fallbackText="Image unavailable"
                  sx={{
                    maxHeight: 400,
                  }}
                />
              ) : (
                <Box sx={{ textAlign: 'center', color: 'text.secondary' }}>
                  {getFileIcon(asset.mimeType)}
                  <Typography sx={{ mt: 1 }}>{asset.mimeType}</Typography>
                </Box>
              )}
            </Box>
          </Grid>

          {/* Details */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Filename
                </Typography>
                <Typography>{asset.originalFilename}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  File Size
                </Typography>
                <Typography>{formatFileSize(asset.fileSize)}</Typography>
              </Box>

              {asset.width && asset.height && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Dimensions
                  </Typography>
                  <Typography>
                    {asset.width} × {asset.height} px
                  </Typography>
                </Box>
              )}

              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Uploaded
                </Typography>
                <Typography>{format(new Date(asset.createdAt), 'MMM d, yyyy h:mm a')}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  URL
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    value={asset.publicUrl || ''}
                    size="small"
                    fullWidth
                    slotProps={{ input: { readOnly: true } }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleCopyUrl}
                    startIcon={copied ? <CheckCircle /> : <ContentCopy />}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </Box>
              </Box>

              <Divider />

              <TextField
                label="Alt Text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                multiline
                rows={2}
                helperText="Describe the image for accessibility"
              />

              <TextField
                label="Caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                multiline
                rows={2}
              />
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button
          color="error"
          startIcon={<Delete />}
          onClick={() => {
            onDelete(asset.id);
            onClose();
          }}
        >
          Delete
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function MediaLibraryPage() {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [search, setSearch] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ filename: string; progress: number }[]>(
    []
  );
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const tabTypes = ['all', 'images', 'documents', 'videos', 'audio', 'other'];

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });

      if (tabTypes[tabValue] !== 'all') {
        params.set('type', tabTypes[tabValue]);
      }

      if (search) {
        params.set('search', search);
      }

      const res = await fetch(`/api/admin/media?${params}`);
      const data = await res.json();

      if (res.ok) {
        setMedia(data.media);
        setTotalPages(data.totalPages);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching media:', error);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tabValue, search]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    const newProgress: { filename: string; progress: number }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newProgress.push({ filename: file.name, progress: 0 });
    }
    setUploadProgress(newProgress);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        // Simulate progress
        setUploadProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, progress: 50 } : p)));

        const res = await fetch('/api/admin/media', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          setUploadProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, progress: 100 } : p))
          );
        } else {
          const error = await res.json();
          setSnackbar({
            open: true,
            message: error.error || `Failed to upload ${file.name}`,
            severity: 'error',
          });
        }
      } catch {
        setSnackbar({
          open: true,
          message: `Failed to upload ${file.name}`,
          severity: 'error',
        });
      }
    }

    // Refresh the list
    await fetchMedia();
    setUploading(false);
    setUploadProgress([]);

    setSnackbar({
      open: true,
      message: `${files.length} file(s) uploaded successfully`,
      severity: 'success',
    });
  };

  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === media.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(media.map((m) => m.id)));
    }
  };

  const handleBulkDelete = async () => {
    try {
      const res = await fetch('/api/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (res.ok) {
        setSnackbar({
          open: true,
          message: `${selectedIds.size} file(s) deleted`,
          severity: 'success',
        });
        setSelectedIds(new Set());
        fetchMedia();
      }
    } catch {
      setSnackbar({
        open: true,
        message: 'Failed to delete files',
        severity: 'error',
      });
    }
    setDeleteDialogOpen(false);
  };

  const handleUpdate = async (id: string, data: { altText?: string; caption?: string }) => {
    try {
      const res = await fetch(`/api/admin/media/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setSnackbar({
          open: true,
          message: 'Media updated',
          severity: 'success',
        });
        fetchMedia();
      }
    } catch {
      setSnackbar({
        open: true,
        message: 'Failed to update media',
        severity: 'error',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/media/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSnackbar({
          open: true,
          message: 'File deleted',
          severity: 'success',
        });
        fetchMedia();
      }
    } catch {
      setSnackbar({
        open: true,
        message: 'Failed to delete file',
        severity: 'error',
      });
    }
  };

  return (
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: { xs: 2, sm: 4 },
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            fontWeight={700}
            gutterBottom
            sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' } }}
          >
            Media Library
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
          >
            Manage your uploaded files and images
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<CloudUpload />}
          component="label"
          disabled={uploading}
          size="small"
        >
          Upload
          <input
            type="file"
            hidden
            multiple
            accept="image/*,.pdf,.txt,.md"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
        </Button>
      </Box>

      {/* Stats */}
      {stats && (
        <Grid container spacing={{ xs: 1, sm: 2 }} sx={{ mb: { xs: 2, sm: 3 } }}>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent
                sx={{
                  textAlign: 'center',
                  p: { xs: 1, sm: 2 },
                  '&:last-child': { pb: { xs: 1, sm: 2 } },
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem' } }}
                >
                  {stats.total}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                >
                  Total Files
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent
                sx={{
                  textAlign: 'center',
                  p: { xs: 1, sm: 2 },
                  '&:last-child': { pb: { xs: 1, sm: 2 } },
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem' } }}
                >
                  {stats.images}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                >
                  Images
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent
                sx={{
                  textAlign: 'center',
                  p: { xs: 1, sm: 2 },
                  '&:last-child': { pb: { xs: 1, sm: 2 } },
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem' } }}
                >
                  {stats.videos}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                >
                  Videos
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent
                sx={{
                  textAlign: 'center',
                  p: { xs: 1, sm: 2 },
                  '&:last-child': { pb: { xs: 1, sm: 2 } },
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem' } }}
                >
                  {stats.audio}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                >
                  Audio
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent
                sx={{
                  textAlign: 'center',
                  p: { xs: 1, sm: 2 },
                  '&:last-child': { pb: { xs: 1, sm: 2 } },
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem' } }}
                >
                  {stats.documents}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                >
                  Documents
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent
                sx={{
                  textAlign: 'center',
                  p: { xs: 1, sm: 2 },
                  '&:last-child': { pb: { xs: 1, sm: 2 } },
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem' } }}
                >
                  {stats.other}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                >
                  Other
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent
                sx={{
                  textAlign: 'center',
                  p: { xs: 1, sm: 2 },
                  '&:last-child': { pb: { xs: 1, sm: 2 } },
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ fontSize: { xs: '1rem', sm: '1.75rem' } }}
                >
                  {formatFileSize(stats.totalSize)}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                >
                  Total Size
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Upload progress */}
      {uploadProgress.length > 0 && (
        <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {uploadProgress.map((item, idx) => (
            <UploadProgress key={idx} {...item} />
          ))}
        </Box>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
            <TextField
              placeholder="Search files..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              size="small"
              sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 }, maxWidth: { xs: '100%', sm: 400 } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />

            {selectedIds.size > 0 && (
              <>
                <Chip
                  label={`${selectedIds.size} selected`}
                  onDelete={() => setSelectedIds(new Set())}
                />
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<Delete />}
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  Delete Selected
                </Button>
              </>
            )}
          </Box>

          <Tabs
            value={tabValue}
            onChange={(_, v) => {
              setTabValue(v);
              setPage(1);
            }}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            <Tab label={`All${stats ? ` (${stats.total})` : ''}`} />
            <Tab
              label={`Images${stats ? ` (${stats.images})` : ''}`}
              icon={<ImageIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
            <Tab
              label={`Documents${stats ? ` (${stats.documents})` : ''}`}
              icon={<PictureAsPdf sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
            <Tab
              label={`Videos${stats ? ` (${stats.videos})` : ''}`}
              icon={<VideoFile sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
            <Tab
              label={`Audio${stats ? ` (${stats.audio})` : ''}`}
              icon={<AudioFile sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
            <Tab
              label={`Other${stats ? ` (${stats.other})` : ''}`}
              icon={<Inventory2 sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
          </Tabs>
        </Box>
      </Card>

      {/* Media Grid */}
      {loading ? (
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Grid key={i} size={{ xs: 6, sm: 4, md: 3 }}>
              <Card>
                <Skeleton variant="rectangular" height={150} />
                <CardContent>
                  <Skeleton width="80%" />
                  <Skeleton width="40%" />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : media.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FolderOpen sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                No files found
              </Typography>
              <Typography color="text.secondary">
                {search ? 'Try a different search term' : 'Upload some files to get started'}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Select all */}
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
            <Checkbox
              checked={selectedIds.size === media.length && media.length > 0}
              indeterminate={selectedIds.size > 0 && selectedIds.size < media.length}
              onChange={handleSelectAll}
            />
            <Typography variant="body2" color="text.secondary">
              Select all
            </Typography>
          </Box>

          <Grid container spacing={2}>
            {media.map((asset) => (
              <Grid key={asset.id} size={{ xs: 6, sm: 4, md: 3 }}>
                <MediaCard
                  asset={asset}
                  selected={selectedIds.has(asset.id)}
                  onSelect={() => handleSelect(asset.id)}
                  onMenuOpen={(e) => {
                    setMenuAnchor(e.currentTarget);
                    setSelectedAsset(asset);
                  }}
                  onClick={() => {
                    setSelectedAsset(asset);
                    setDetailOpen(true);
                  }}
                />
              </Grid>
            ))}
          </Grid>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, gap: 1 }}>
              <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Typography sx={{ display: 'flex', alignItems: 'center', px: 2 }}>
                Page {page} of {totalPages}
              </Typography>
              <Button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </Box>
          )}
        </>
      )}

      {/* Context Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setDetailOpen(true);
            setMenuAnchor(null);
          }}
        >
          <Edit sx={{ mr: 1, fontSize: 18 }} />
          Edit Details
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (selectedAsset?.publicUrl) {
              navigator.clipboard.writeText(selectedAsset.publicUrl);
              setSnackbar({
                open: true,
                message: 'URL copied to clipboard',
                severity: 'success',
              });
            }
            setMenuAnchor(null);
          }}
        >
          <ContentCopy sx={{ mr: 1, fontSize: 18 }} />
          Copy URL
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (selectedAsset) {
              handleDelete(selectedAsset.id);
            }
            setMenuAnchor(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <Delete sx={{ mr: 1, fontSize: 18 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Detail Dialog */}
      <MediaDetailDialog
        open={detailOpen}
        asset={selectedAsset}
        onClose={() => setDetailOpen(false)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      {/* Bulk Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Files</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete {selectedIds.size} file(s)? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleBulkDelete} color="error" variant="contained">
            Delete
          </Button>
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
    </Box>
  );
}
