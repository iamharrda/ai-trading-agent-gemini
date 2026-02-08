// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	output: 'standalone',
	serverExternalPackages: ['@google/generative-ai'],
	experimental: {
		instrumentationHook: true,
		// Remove any deprecated options
	},
};

export default nextConfig;
