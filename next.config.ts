import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'efjrpanojfahqjwqpagg.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
};

export default nextConfig;