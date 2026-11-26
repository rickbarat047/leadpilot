import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Static marketing surface only — authenticated app pages are excluded
// (see robots.ts). Update `lastModified` when a page's content changes materially.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const pages: [string, number][] = [
    ['', 1.0],
    ['pricing', 0.9],
    ['features', 0.9],
    ['how-it-works', 0.7],
    ['industries', 0.7],
    ['faq', 0.7],
    ['demo', 0.7],
    ['contact', 0.5],
    ['privacy', 0.3],
    ['terms', 0.3],
  ];
  return pages.map(([path, priority]) => ({
    url: path ? `${SITE_URL}/${path}` : `${SITE_URL}/`,
    lastModified,
    changeFrequency: 'monthly',
    priority,
  }));
}
