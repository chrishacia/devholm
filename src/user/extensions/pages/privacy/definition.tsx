import 'server-only';
import type { DevPageDefinition } from '@core/types/dev-pages';

function readEffectiveDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

const effectiveDate = readEffectiveDate(process.env.DEVHOLM_PRIVACY_EFFECTIVE_DATE);

export const devholmPrivacyPage: DevPageDefinition | null = effectiveDate
  ? {
      key: 'devholm-privacy',
      path: '/privacy',
      title: 'Privacy',
      loadPage: async () => {
        const { default: PrivacyNotice } = await import('./PrivacyNotice');
        return function DevHolmPrivacyPage() {
          return <PrivacyNotice effectiveDate={effectiveDate} />;
        };
      },
      getMetadata: () => ({ title: 'Privacy' }),
      enabledByDefault: true,
      showInFooterResourcesByDefault: true,
    }
  : null;
