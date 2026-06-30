import { Metadata } from 'next';
import AnalyticsDashboard from './AnalyticsDashboard';

export const metadata: Metadata = {
  title: 'Analytics | Admin',
  description: 'View site traffic analytics and referrer sources',
};

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
