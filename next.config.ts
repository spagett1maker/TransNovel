import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Google OAuth 프로필 이미지
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      // Gravatar
      { protocol: "https", hostname: "www.gravatar.com" },
      // 로컬 개발
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
