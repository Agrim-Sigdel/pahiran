/** @type {import('next').NextConfig} */
const nextConfig = {
  // A stray package-lock.json in a parent directory makes Next infer the
  // wrong workspace root, which can corrupt the build output layout. Pin it.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
