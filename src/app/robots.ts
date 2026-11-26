import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated app, admin console, APIs and auth screens stay out of
        // the index; the marketing pages are the public surface.
        disallow: ['/app', '/admin', '/api', '/onboarding', '/login', '/signup'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
