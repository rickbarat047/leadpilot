/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enables src/instrumentation.ts (register + onRequestError) on Next 14.2
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        // Security headers for every page + API response
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          {
            key: 'Content-Security-Policy',
            // No external assets at all (server-side fetches to Resend/OpenAI are not
            // covered by CSP). 'unsafe-inline'/'unsafe-eval' are required by Next.js
            // hydration + React; frame-ancestors 'none' is the modern clickjacking guard.
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; " +
              "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
