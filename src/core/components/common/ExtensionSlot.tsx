'use client';

/**
 * ExtensionSlot — Named Injection Point
 * ======================================
 *
 * Renders a user-registered component at a named slot in a core page view.
 * If no component is registered for the slot in devholm.config.ts, renders nothing.
 *
 * Usage:
 * ```tsx
 * import { ExtensionSlot } from '@core/components/common/ExtensionSlot';
 * import config from '@config';
 *
 * // Inside a core view JSX:
 * <ExtensionSlot name="blog.sidebar.bottom" config={config} />
 * ```
 */

import type { SlotName, SlotsConfig } from '@core/types/extensions';

interface ExtensionSlotProps {
  /** The named slot to render into */
  name: SlotName;
  /** The slots config from devholm.config.ts */
  config: { slots?: SlotsConfig };
  /** Optional props forwarded to the slot component */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slotProps?: Record<string, any>;
}

export function ExtensionSlot({ name, config, slotProps = {} }: ExtensionSlotProps) {
  const SlotComponent = config.slots?.[name];
  if (!SlotComponent) return null;
  return <SlotComponent {...slotProps} />;
}
