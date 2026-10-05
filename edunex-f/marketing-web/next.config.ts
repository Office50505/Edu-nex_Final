import type { NextConfig } from 'next'

const marketingBasePath =
  process.env.NEXT_PUBLIC_MARKETING_BASE_PATH || '/static-pages/skillomate-ai-influencer-courseweb'

const nextConfig: NextConfig = {
  output: 'export',
  basePath: marketingBasePath,
  trailingSlash: true,
  reactStrictMode: true,
  devIndicators: false,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
