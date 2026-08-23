/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the shared workspace package (ships as TS source).
  transpilePackages: ['@sentinel/shared'],
  experimental: {
    // Ensure server actions work behind proxies (Vercel/local).
  },
};

export default nextConfig;
