/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ["@coolfTC/ui", "@coolfTC/db", "@coolfTC/aria", "@coolfTC/ftc-api", "@coolfTC/types"],
  experimental: { serverActions: { allowedOrigins: ["localhost:3000"] } },
};
export default config;
