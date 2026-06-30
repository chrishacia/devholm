'use client';

import { Box, Container, Typography, useTheme, alpha, Breadcrumbs } from '@mui/material';
import Link from '@/components/common/Link';
import { NavigateNext as NavigateNextIcon } from '@mui/icons-material';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface SubHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  announcement?: {
    message: string;
    link?: string;
    linkText?: string;
  };
}

export function SubHeader({ breadcrumbs, announcement }: SubHeaderProps) {
  const theme = useTheme();

  if (!breadcrumbs?.length && !announcement) {
    return null;
  }

  return (
    <Box
      sx={{
        backgroundColor: alpha(theme.palette.primary.main, 0.05),
        borderBottom: `1px solid ${theme.palette.divider}`,
        py: 1.5,
      }}
    >
      <Container maxWidth="xl">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumbs
              separator={<NavigateNextIcon fontSize="small" />}
              aria-label="breadcrumb"
              sx={{
                '& .MuiBreadcrumbs-separator': {
                  mx: 1,
                  color: theme.palette.text.disabled,
                },
              }}
            >
              <Link
                href="/"
                style={{
                  color: theme.palette.text.secondary,
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                }}
              >
                Home
              </Link>
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;

                if (isLast || !item.href) {
                  return (
                    <Typography
                      key={item.label}
                      color="text.primary"
                      sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                    >
                      {item.label}
                    </Typography>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    style={{
                      color: theme.palette.text.secondary,
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </Breadcrumbs>
          )}

          {/* Announcement */}
          {announcement && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontSize: '0.875rem',
                color: theme.palette.text.secondary,
              }}
            >
              <Typography variant="body2">{announcement.message}</Typography>
              {announcement.link && announcement.linkText && (
                <Link
                  href={announcement.link}
                  style={{
                    color: theme.palette.primary.main,
                    fontWeight: 500,
                  }}
                >
                  {announcement.linkText}
                </Link>
              )}
            </Box>
          )}
        </Box>
      </Container>
    </Box>
  );
}
