'use client';

import { useState, useCallback, useRef } from 'react';
import { Box, IconButton, SxProps, Theme, Typography } from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff,
  MusicNote,
  ErrorOutline,
} from '@mui/icons-material';

interface SafeAudioProps {
  src: string | null | undefined;
  title?: string;
  sx?: SxProps<Theme>;
  showControls?: boolean;
  fallbackText?: string;
}

/**
 * SafeAudio Component
 * ===================
 *
 * A wrapper around audio that gracefully handles:
 * - Missing/broken audio files (shows placeholder)
 * - Null/undefined src values
 * - Network errors
 *
 * Usage:
 * <SafeAudio src={track.audioUrl} title={track.name} />
 */
export function SafeAudio({
  src,
  title = 'Audio',
  sx,
  showControls = true,
  fallbackText = 'Audio not available',
}: SafeAudioProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
        <Box>
          <Typography variant="body2" color="text.secondary">
            {fallbackText}
          </Typography>
          {title && (
            <Typography variant="caption" color="text.disabled">
              {title}
            </Typography>
          )}
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
      <audio
        ref={audioRef}
        src={src}
        onError={handleError}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />

      <MusicNote sx={{ fontSize: 24, color: 'primary.main' }} />

      {showControls && (
        <>
          <IconButton onClick={togglePlay} size="small" color="primary">
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>

          <Box sx={{ flex: 1, minWidth: 100 }}>
            <Typography variant="body2" noWrap>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatTime(currentTime)} / {formatTime(duration)}
            </Typography>
          </Box>

          <IconButton onClick={toggleMute} size="small">
            {isMuted ? <VolumeOff /> : <VolumeUp />}
          </IconButton>
        </>
      )}
    </Box>
  );
}
