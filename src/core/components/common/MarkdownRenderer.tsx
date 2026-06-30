'use client';

import { Box, alpha } from '@mui/material';
import { CodeBlock, parseCodeBlocks, renderMarkdownText } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  sx?: object;
}

/**
 * Renders markdown content with proper code block support
 * including line numbers and copy buttons
 */
export function MarkdownRenderer({ content, sx }: MarkdownRendererProps) {
  const parts = parseCodeBlocks(content);

  return (
    <Box
      sx={{
        '& h1, & h2, & h3': { mt: 3, mb: 1.5 },
        '& h2': { fontWeight: 600, fontSize: '1.5rem' },
        '& h3': { fontWeight: 600, fontSize: '1.25rem' },
        '& p': { mb: 2, lineHeight: 1.8 },
        '& ul, & ol': {
          mb: 2,
          pl: 2.5,
          ml: 0,
        },
        '& li': { mb: 0.5 },
        '& code:not(pre code)': {
          fontFamily: 'monospace',
          fontSize: '0.875em',
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
          px: 0.75,
          py: 0.25,
          borderRadius: 0.5,
        },
        '& a': { color: 'primary.main' },
        '& blockquote': {
          borderLeft: 4,
          borderColor: 'primary.main',
          pl: 2,
          ml: 0,
          fontStyle: 'italic',
          color: 'text.secondary',
        },
        '& strong': { fontWeight: 600 },
        ...sx,
      }}
    >
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return <CodeBlock key={index} code={part.content} language={part.language} />;
        }

        // Render text content
        const html = renderMarkdownText(part.content);
        return <Box key={index} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </Box>
  );
}
