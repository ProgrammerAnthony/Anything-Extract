/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Docker 部署时通过 BACKEND_URL 环境变量配置后端地址
    // 本地开发默认使用 http://localhost:8888
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8888';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

