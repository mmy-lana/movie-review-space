import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Poster and backdrop URLs are user-supplied and may point at any host, so
    // the optimiser's build-time allow-list cannot cover them. Components render
    // native `<img>` elements with explicit `sizes`, lazy loading and blur-up
    // placeholders instead, which also keeps the app fully functional offline.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
