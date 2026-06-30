import { getStructuredDataExtensionData } from '@core/lib/extensions.server';

interface SeoExtensionJsonLdProps {
  path: string;
}

export default async function SeoExtensionJsonLd({ path }: SeoExtensionJsonLdProps) {
  const entries = await getStructuredDataExtensionData(path).catch(() => []);

  if (entries.length === 0) {
    return null;
  }

  return (
    <>
      {entries.map((entry, index) => (
        <script
          key={`${path}-jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
    </>
  );
}
