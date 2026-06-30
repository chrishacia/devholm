'use client';

import { useState, useCallback, useRef } from 'react';
import { Box, IconButton, SxProps, Theme, Typography } from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff,
  Fullscreen,
  Videocam,
  ErrorOutline,
} from '@mui/icons-material';

interface SafeVideoProps {
  src: string | null | undefined;
  poster?: string | null;
  title?: string;
  width?: number | string;
  height?: number | string;
  sx?: SxProps<Theme>;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  fallbackText?: string;
}

/**
 * SafeVideo Component
 * ===================
 *
 * A wrapper around video that gracefully handles:
 * - Missing/broken video files (shows placeholder)
 * - Null/undefined src values
 * - Network errors
 *
 * Usage:
 * <SafeVideo src={post.videoUrl} poster={post.thumbnail} />
 */
export function SafeVideo({
  src,
  poster,
  title = 'Video',
  width = '100%',
  height = 'auto',
  sx,
  controls = true,
  autoPlay = false,
  muted = false,
  loop = false,
  fallbackText = 'Video not available',
}: SafeVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(muted);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const toggleFullscreen = useCallback(() => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  // If no src or error occurred, show placeholder
  if (!src || hasError) {
    return (
      <Box
        sx={{
          width,
          height: typeof height === 'string' && height === 'auto' ? 200 : height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
          borderRadius: 1,
          color: 'text.disabled',
          gap: 1,
          ...sx,
        }}
      >
        <ErrorOutline sx={{ fontSize: 48, opacity: 0.5 }} />
        <Typography variant="body2" textAlign="center" px={2}>
          {fallbackText}
        </Typography>
        {title && (
          <Typography variant="caption" color="text.disabled">
            {title}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width,
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: 'black',
        ...sx,
      }}
    >
      <Box
        component="video"
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        onError={handleError}
        onPlay={handlePlay}
        onPause={handlePause}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline
        sx={{
          width: '100%',
          height,
          display: 'block',
        }}
      />

      {!controls && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            p: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'rgba(0,0,0,0.6)',
          }}
        >
          <IconButton onClick={togglePlay} size="small" sx={{ color: 'white' }}>
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <Videocam sx={{ fontSize: 16, color: 'white', opacity: 0.7 }} />
          <Typography variant="caption" sx={{ color: 'white', flex: 1 }} noWrap>
            {title}
          </Typography>
          <IconButton onClick={toggleMute} size="small" sx={{ color: 'white' }}>
            {isMuted ? <VolumeOff fontSize="small" /> : <VolumeUp fontSize="small" />}
          </IconButton>
          <IconButton onClick={toggleFullscreen} size="small" sx={{ color: 'white' }}>
            <Fullscreen fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}
