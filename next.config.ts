import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
	/* config options here */
	// Pin the workspace root so Next.js doesn't infer it from an unrelated lockfile elsewhere.
	turbopack: {
		root: __dirname,
	},
	...(process.env.NEXT_BUILD_DIR ? { distDir: process.env.NEXT_BUILD_DIR } : {}),
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
