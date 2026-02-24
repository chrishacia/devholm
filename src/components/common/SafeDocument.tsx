'use client';

import { useState, useCallback, useEffect } from 'react';
import { Box, Button, SxProps, Theme, Typography, CircularProgress } from '@mui/material';
import {
  PictureAsPdf,
  Description,
  Article,
  InsertDriveFile,
  Download,
  OpenInNew,
  ErrorOutline,
} from '@mui/icons-material';
import { formatFileSize } from '@/lib/utils';

interface SafeDocumentProps {
  src: string | null | undefined;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
  sx?: SxProps<Theme>;
  showPreview?: boolean;
  fallbackText?: string;
}

// Icon mapping for different document types
const getDocumentIcon = (mimeType?: string) => {
  if (!mimeType) return InsertDriveFile;

  if (mimeType.includes('pdf')) return PictureAsPdf;
  if (mimeType.includes('word') || mimeType.includes('document')) return Description;
  if (mimeType.includes('text')) return Article;

  return InsertDriveFile;
};

// formatFileSize imported from @/lib/utils

// Get human-readable document type
const getDocumentType = (mimeType?: string): string => {
  if (!mimeType) return 'Document';

  if (mimeType.includes('pdf')) return 'PDF Document';
  if (mimeType.includes('msword') || mimeType.includes('wordprocessingml')) return 'Word Document';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Spreadsheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'Presentation';
  if (mimeType.includes('text/plain')) return 'Text File';
  if (mimeType.includes('text/csv')) return 'CSV File';
  if (mimeType.includes('text/markdown')) return 'Markdown File';

  return 'Document';
};

/**
 * SafeDocument Component
 * ======================
 *
 * A wrapper for document files that gracefully handles:
 * - Missing/broken document files (shows placeholder)
 * - Null/undefined src values
 * - Network errors when checking availability
 *
 * Usage:
 * <SafeDocument src={file.url} filename={file.name} mimeType={file.type} />
 */
export function SafeDocument({
  src,
  filename = 'Document',
  mimeType,
  fileSize,
  sx,
  showPreview = true,
  fallbackText = 'Document not available',
}: SafeDocumentProps) {
  const [hasError, setHasError] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Check document availability on mount
  useEffect(() => {
    if (!src) return;

    const checkAvailability = async () => {
      setIsChecking(true);
      try {
        const response = await fetch(src, { method: 'HEAD' });
        if (!response.ok) {
          setHasError(true);
        }
      } catch {
        setHasError(true);
      } finally {
        setIsChecking(false);
      }
    };

    checkAvailability();
  }, [src]);

  const handleDownload = useCallback(() => {
    if (!src) return;

    const link = document.createElement('a');
    link.href = src;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [src, filename]);

  const handleOpen = useCallback(() => {
    if (!src) return;
    window.open(src, '_blank', 'noopener,noreferrer');
  }, [src]);

  const Icon = getDocumentIcon(mimeType);
  const docType = getDocumentType(mimeType);
  const size = formatFileSize(fileSize);

  // If no src or error occurred, show placeholder
  if (!src || hasError) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 2,
          bgcolor: 'action.hover',
          borderRadius: 1,
          color: 'text.disabled',
          ...sx,
        }}
      >
        <ErrorOutline sx={{ fontSize: 32, opacity: 0.5 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {fallbackText}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {filename}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        ...sx,
      }}
    >
      <Icon sx={{ fontSize: 40, color: 'primary.main' }} />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={500} noWrap>
          {filename}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {docType}
          {size && ` • ${size}`}
        </Typography>
      </Box>

      {isChecking ? (
        <CircularProgress size={20} />
      ) : (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {showPreview && mimeType?.includes('pdf') && (
            <Button size="small" variant="outlined" startIcon={<OpenInNew />} onClick={handleOpen}>
              View
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            startIcon={<Download />}
            onClick={handleDownload}
          >
            Download
          </Button>
        </Box>
      )}
    </Box>
  );
}
