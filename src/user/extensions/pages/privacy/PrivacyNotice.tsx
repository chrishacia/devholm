import { Box, Container, Typography } from '@mui/material';
import { AuthAwareMainLayout } from '@/components';
import Link from '@/components/common/Link';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  timeZone: 'UTC',
});

export default function PrivacyNotice({ effectiveDate }: { effectiveDate: Date }) {
  return (
    <AuthAwareMainLayout breadcrumbs={[{ label: 'Privacy' }]}>
      <Container component="main" maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
        <Typography variant="h2" component="h1" sx={{ mb: 3, fontWeight: 700 }}>
          Privacy
        </Typography>
        <Box
          sx={{
            typography: 'body1',
            '& h2': { typography: 'h5', mt: 4, mb: 1 },
            '& p': { mb: 2, lineHeight: 1.8 },
          }}
        >
          <p>
            <strong>Effective date:</strong>{' '}
            <time dateTime={effectiveDate.toISOString().slice(0, 10)}>
              {dateFormat.format(effectiveDate)}
            </time>
          </p>
          <p>
            This notice covers the live site at devholm.com. devholm (&quot;we&quot;,
            &quot;us&quot;) decide how this information is used.
          </p>

          <h2>Analytics</h2>
          <p>
            We run our own first-party analytics on this site. It is not the fleet Umami collector.
            It records visits such as the page path and title, a referring site, campaign tags in a
            link, and an approximate country from the network. It does not store your IP address. It
            doesn&apos;t use cookies for analytics. A short-lived session marker may sit in your
            tab&apos;s session storage (ch_analytics_session) and goes away when you close the tab.
          </p>
          <p>
            We will delete detailed analytics records after about 180 days. Totals (aggregate
            counts) are kept.
          </p>

          <h2>Contact form</h2>
          <p>
            If you use the <Link href="/contact">Contact form</Link> on this site, we get the
            details you enter (such as your name, email, subject and message) so we can read them
            and reply. We do not publish an email address on this page.
          </p>

          <h2>Server logs</h2>
          <p>
            Our web server keeps connection logs (such as IP address, the page requested, time, and
            browser type) so we can run and secure the site. We delete these logs after about 15
            days.
          </p>

          <h2>Children</h2>
          <p>
            This site is not directed at children under 13. A parent or guardian can use the Contact
            form about a child&apos;s information.
          </p>

          <h2>Contact</h2>
          <p>
            Use the <Link href="/contact">Contact form</Link> on this site. We do not publish an
            email address on this page.
          </p>
        </Box>
      </Container>
    </AuthAwareMainLayout>
  );
}
