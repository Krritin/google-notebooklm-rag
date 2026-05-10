/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "pdf-parse",
      "@xenova/transformers",
      "onnxruntime-node",
      "sharp",
    ],
  },
  webpack: (config) => {
    // Don't bundle native binaries — let them resolve at runtime.
    config.externals = config.externals || [];
    config.externals.push({
      "onnxruntime-node": "commonjs onnxruntime-node",
      sharp: "commonjs sharp",
    });
    return config;
  },
};

export default nextConfig;
