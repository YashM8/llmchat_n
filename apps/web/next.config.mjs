import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone',

  // 👇  compile raw-TS/JSX libs that live outside apps/web
  transpilePackages: [
    'next-mdx-remote',            // ← already there
    '@repo/actions',
    '@repo/ai',
    '@repo/common',
    '@repo/orchestrator',
    '@repo/prisma',
    '@repo/shared',
    '@repo/ui',
    // add more internal packages later if you introduce new TS/JSX code
  ],

  images: {
    remotePatterns: [
      { hostname: 'www.google.com' },
      { hostname: 'img.clerk.com' },
      { hostname: 'zyqdiwxgffuy8ymd.public.blob.vercel-storage.com' },
    ],
  },

  experimental: {
    externalDir: true,
  },

  webpack: (config, options) => {
    if (!options.isServer) {
      config.resolve.fallback = { fs: false, module: false, path: false };
    }
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
      layers: true,
    };
    return config;
  },

  async redirects() {
    return [{ source: '/', destination: '/chat', permanent: true }];
  },
};

export default withSentryConfig(nextConfig, {
  org: 'saascollect',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
