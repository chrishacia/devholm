'use client';

/**
 * Custom Link Component
 * =====================
 *
 * A wrapper around Next.js Link that:
 * 1. Works with MUI's component prop (required for Next.js 16)
 * 2. Disables prefetch by default to prevent excessive API calls
 *
 * The default Next.js behavior prefetches all visible links, which causes
 * dozens of RSC requests on page load (one for each nav link in header/footer).
 *
 * To enable prefetch for specific links, pass prefetch={true} explicitly.
 *
 * See: https://mui.com/material-ui/integrations/nextjs/#next-js-v16-client-component-restriction
 */

import NextLink, { type LinkProps } from 'next/link';
import { forwardRef, type AnchorHTMLAttributes } from 'react';

type NextLinkProps = LinkProps & AnchorHTMLAttributes<HTMLAnchorElement>;

const Link = forwardRef<HTMLAnchorElement, NextLinkProps>((props, ref) => {
  // Disable prefetch by default to prevent excessive RSC requests
  // Can be overridden by passing prefetch={true} explicitly
  const { prefetch = false, ...rest } = props;
  return <NextLink ref={ref} prefetch={prefetch} {...rest} />;
});

Link.displayName = 'Link';

export default Link;
export type { NextLinkProps as LinkProps };
