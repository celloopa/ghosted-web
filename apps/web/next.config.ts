import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@ghosted/core'],
  // Produce a self-contained server bundle for Docker deployment.
  // The output is placed at .next/standalone — see Dockerfile.
  output: 'standalone',
}

export default nextConfig
