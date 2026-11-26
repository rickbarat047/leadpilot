// Single source of truth for the site's public origin. Used by metadataBase,
// robots, sitemap and canonical URLs. When the custom domain lands (P6 user
// action), set NEXT_PUBLIC_SITE_URL in Vercel — no code change needed.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://leadpilot-sepia-six.vercel.app'
).replace(/\/$/, '');

export const SITE_NAME = 'LeadPilot';
export const SITE_DESCRIPTION =
  'LeadPilot instantly responds to new leads, follows up automatically, qualifies prospects, and books appointments while you focus on your business.';
