'use client';

import { useState, useCallback } from 'react';
import { Box, IconButton, Tooltip, Typography, useTheme, alpha } from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language, showLineNumbers = true }: CodeBlockProps) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [code]);

  const lines = code.split('\n');
  // Remove trailing empty line if present
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor:
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.common.black, 0.4)
            : alpha(theme.palette.common.black, 0.05),
        border: 1,
        borderColor: 'divider',
        my: 1.5,
      }}
    >
      {/* Header with language and copy button */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 1,
          py: 0.5,
          bgcolor:
            theme.palette.mode === 'dark'
              ? alpha(theme.palette.common.black, 0.3)
              : alpha(theme.palette.common.black, 0.08),
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: 0.5,
          }}
        >
          {language || 'code'}
        </Typography>
        <Tooltip title={copied ? 'Copied!' : 'Copy code'}>
          <IconButton
            size="small"
            onClick={handleCopy}
            sx={{
              p: 0.25,
              color: copied ? 'success.main' : 'text.secondary',
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.1),
              },
            }}
          >
            {copied ? <Check sx={{ fontSize: 14 }} /> : <ContentCopy sx={{ fontSize: 14 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Code content */}
      <Box
        sx={{
          display: 'flex',
          overflow: 'auto',
          fontSize: '0.8rem',
          lineHeight: 1.5,
        }}
      >
        {/* Line numbers */}
        {showLineNumbers && (
          <Box
            component="pre"
            aria-hidden="true"
            sx={{
              m: 0,
              py: 1,
              px: 1,
              textAlign: 'right',
              color: 'text.disabled',
              bgcolor:
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.common.black, 0.2)
                  : alpha(theme.palette.common.black, 0.03),
              borderRight: 1,
              borderColor: 'divider',
              userSelect: 'none',
              fontFamily: 'monospace',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              minWidth: lines.length > 99 ? 40 : lines.length > 9 ? 32 : 24,
            }}
          >
            {lines.map((_, i) => (
              <Box key={i} component="span" sx={{ display: 'block' }}>
                {i + 1}
              </Box>
            ))}
          </Box>
        )}

        {/* Code */}
        <Box
          component="pre"
          sx={{
            m: 0,
            py: 1,
            px: 1.5,
            pl: showLineNumbers ? 1 : 1.5,
            flex: 1,
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: 'inherit',
            lineHeight: 'inherit',
          }}
        >
          <code>{code}</code>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Render markdown code blocks with proper styling
 * This function parses markdown content and extracts code blocks,
 * returning an array of elements (strings for regular content, CodeBlock for code)
 */
export function parseCodeBlocks(
  content: string
): Array<{ type: 'text' | 'code'; content: string; language?: string }> {
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }

    // Add code block
    parts.push({
      type: 'code',
      content: match[2].trim(),
      language: match[1] || undefined,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last code block
  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }

  return parts;
}

/**
 * Simple markdown to HTML converter for non-code content
 */
export function renderMarkdownText(text: string): string {
  return text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*)/gm, (_, title) => {
      const id = title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
      return `<h2 id="${id}">${title}</h2>`;
    })
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/^\d+\. (.*)/gm, '<li>$1</li>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<h[123]|<li)/g, '$1')
    .replace(/(<\/h[123]>|<\/li>)<\/p>/g, '$1');
}
