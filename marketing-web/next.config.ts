import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/marketing-web',
  trailingSlash: true,
  reactStrictMode: true,
  devIndicators: false,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
