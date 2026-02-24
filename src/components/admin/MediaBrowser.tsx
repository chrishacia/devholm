'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid2 as Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Skeleton,
  IconButton,
  LinearProgress,
} from '@mui/material';
import { CloudUpload, Search, Image as ImageIcon, CheckCircle, Close } from '@mui/icons-material';
import { SafeImage } from '@/components/common';
import { formatFileSize } from '@/lib/utils';

interface MediaAsset {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  publicUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

interface MediaBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  selectedUrl?: string | null;
  acceptedTypes?: 'images' | 'documents' | 'all';
}

// formatFileSize imported from @/lib/utils

export default function MediaBrowser({
  open,
  onClose,
  onSelect,
  selectedUrl,
  acceptedTypes = 'images',
}: MediaBrowserProps) {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tabValue, setTabValue] = useState(0); // 0 = Browse, 1 = Upload
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '12',
      });

      if (acceptedTypes !== 'all') {
        params.set('type', acceptedTypes);
      }

      if (search) {
        params.set('search', search);
      }

      const res = await fetch(`/api/admin/media?${params}`);
      const data = await res.json();

      if (res.ok) {
        setMedia(data.media);
        setTotalPages(data.totalPages);
      }
    } catch (error) {
      console.error('Error fetching media:', error);
    } finally {
      setLoading(false);
    }
  }, [page, acceptedTypes, search]);

  useEffect(() => {
    if (open) {
      fetchMedia();
    }
  }, [open, fetchMedia]);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setTabValue(0);
      setSelectedAsset(null);
      setPage(1);
      setSearch('');
    }
  }, [open]);

  const handleUpload = async (files: FileList) => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(50);

      const res = await fetch('/api/admin/media', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const uploaded = await res.json();
        setUploadProgress(100);

        // Auto-select the uploaded file
        setSelectedAsset(uploaded);
        setTabValue(0);

        // Refresh the list
        await fetchMedia();
      } else {
        const error = await res.json();
        console.error('Upload failed:', error);
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSelect = () => {
    if (selectedAsset) {
      onSelect(selectedAsset);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Select Media</Typography>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, minHeight: 400 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab label="Browse Library" />
            <Tab
              label="Upload New"
              icon={<CloudUpload sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
          </Tabs>
        </Box>

        {tabValue === 0 && (
          <Box sx={{ p: 2 }}>
            {/* Search */}
            <TextField
              placeholder="Search files..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              size="small"
              fullWidth
              sx={{ mb: 2 }}
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

            {/* Media Grid */}
            {loading ? (
              <Grid container spacing={1}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Grid key={i} size={{ xs: 4, sm: 3 }}>
                    <Skeleton variant="rectangular" height={100} />
                  </Grid>
                ))}
              </Grid>
            ) : media.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <ImageIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography color="text.secondary">
                  {search ? 'No files found' : 'No media files yet'}
                </Typography>
              </Box>
            ) : (
              <>
                <Grid container spacing={1}>
                  {media.map((asset) => {
                    const isSelected = selectedAsset?.id === asset.id;
                    const isCurrentlyUsed = selectedUrl === asset.publicUrl;
                    const isImage = asset.mimeType.startsWith('image/');

                    return (
                      <Grid key={asset.id} size={{ xs: 4, sm: 3 }}>
                        <Card
                          onClick={() => setSelectedAsset(asset)}
                          sx={{
                            cursor: 'pointer',
                            position: 'relative',
                            border: 2,
                            borderColor: isSelected
                              ? 'primary.main'
                              : isCurrentlyUsed
                                ? 'success.main'
                                : 'transparent',
                            transition: 'all 0.2s',
                            '&:hover': {
                              borderColor: isSelected ? 'primary.main' : 'primary.light',
                            },
                          }}
                        >
                          {/* Selection indicator */}
                          {(isSelected || isCurrentlyUsed) && (
                            <Box
                              sx={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                zIndex: 2,
                                bgcolor: isSelected ? 'primary.main' : 'success.main',
                                borderRadius: '50%',
                                p: 0.25,
                              }}
                            >
                              <CheckCircle sx={{ fontSize: 18, color: 'white' }} />
                            </Box>
                          )}

                          {/* Thumbnail */}
                          <Box
                            sx={{
                              height: 80,
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
                                showPlaceholder={false}
                              />
                            ) : (
                              <ImageIcon sx={{ color: 'text.secondary' }} />
                            )}
                          </Box>

                          <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                            <Typography variant="caption" noWrap title={asset.originalFilename}>
                              {asset.originalFilename}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, gap: 1 }}>
                    <Button
                      size="small"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                      Page {page} of {totalPages}
                    </Typography>
                    <Button
                      size="small"
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </Box>
                )}
              </>
            )}
          </Box>
        )}

        {tabValue === 1 && (
          <Box sx={{ p: 4 }}>
            <Box
              sx={{
                border: 2,
                borderStyle: 'dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                transition: 'border-color 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                },
              }}
            >
              <input
                type="file"
                accept={acceptedTypes === 'images' ? 'image/*' : '*/*'}
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
                style={{ display: 'none' }}
                id="media-browser-upload"
                disabled={uploading}
              />
              <label htmlFor="media-browser-upload" style={{ cursor: 'pointer' }}>
                <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Click to upload
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {acceptedTypes === 'images'
                    ? 'PNG, JPG, GIF, WebP, SVG up to 10MB'
                    : 'Any file up to 10MB'}
                </Typography>
              </label>

              {uploading && (
                <Box sx={{ mt: 3 }}>
                  <LinearProgress variant="determinate" value={uploadProgress} />
                  <Typography variant="caption" sx={{ mt: 1 }}>
                    Uploading...
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {selectedAsset && tabValue === 0 && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, pl: 2 }}>
            {selectedAsset.mimeType.startsWith('image/') && selectedAsset.publicUrl && (
              <SafeImage
                src={selectedAsset.publicUrl}
                alt={selectedAsset.originalFilename}
                width={40}
                height={40}
                objectFit="cover"
                sx={{ borderRadius: 1 }}
                showPlaceholder={false}
              />
            )}
            <Box>
              <Typography variant="body2" fontWeight={500}>
                {selectedAsset.originalFilename}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatFileSize(selectedAsset.fileSize)}
                {selectedAsset.width && selectedAsset.height && (
                  <>
                    {' '}
                    • {selectedAsset.width}×{selectedAsset.height}
                  </>
                )}
              </Typography>
            </Box>
          </Box>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSelect} disabled={!selectedAsset}>
          Select
        </Button>
      </DialogActions>
    </Dialog>
  );
}
