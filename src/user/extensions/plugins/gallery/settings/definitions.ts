import type { PluginSettingsDefinition } from '@core/types/plugins';
import {
  GALLERY_BASELINE_SCHEMA_VERSION,
  GALLERY_BASELINE_SCHEMA_VERSION_KEY,
  GALLERY_LIFECYCLE_DATA_RETENTION_POLICY,
  GALLERY_LIFECYCLE_DATA_RETENTION_POLICY_KEY,
  GALLERY_LIFECYCLE_PURGE_POLICY_KEY,
  GALLERY_LIFECYCLE_UNINSTALL_POLICY,
  GALLERY_LIFECYCLE_UNINSTALL_POLICY_KEY,
} from '@user/extensions/plugins/gallery/constants';

export const gallerySettingsDefinitions: readonly PluginSettingsDefinition[] = [
  {
    key: GALLERY_BASELINE_SCHEMA_VERSION_KEY,
    type: 'string',
    defaultValue: GALLERY_BASELINE_SCHEMA_VERSION,
    category: 'plugins',
    description: 'Gallery schema baseline adopted from existing core migration state',
  },
  {
    key: GALLERY_LIFECYCLE_DATA_RETENTION_POLICY_KEY,
    type: 'string',
    defaultValue: GALLERY_LIFECYCLE_DATA_RETENTION_POLICY,
    category: 'plugins',
    description: 'Gallery lifecycle retention policy for disable/uninstall operations',
  },
  {
    key: GALLERY_LIFECYCLE_UNINSTALL_POLICY_KEY,
    type: 'string',
    defaultValue: GALLERY_LIFECYCLE_UNINSTALL_POLICY,
    category: 'plugins',
    description: 'Gallery uninstall policy remains non-destructive and preserves all data',
  },
  {
    key: GALLERY_LIFECYCLE_PURGE_POLICY_KEY,
    type: 'json',
    defaultValue: {
      requiresConfirmPluginId: true,
      blockedWhenDataPresent: true,
      destructiveDataWipe: 'blocked',
      warning:
        'Gallery purge is safety-gated and blocked while Gallery tables contain rows or media references. Disable/uninstall remain non-destructive.',
    },
    category: 'plugins',
    description: 'Gallery purge safety contract and confirmation expectations',
  },
];
