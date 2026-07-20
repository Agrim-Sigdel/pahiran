// Garment photos live in the public Supabase Storage bucket, so the optimiser
// has to be told that host is allowed. Derived from the same env var the app
// uses, so a new Supabase project needs no config change here.
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A stray package-lock.json in a parent directory makes Next infer the
  // wrong workspace root, which can corrupt the build output layout. Pin it.
  outputFileTracingRoot: import.meta.dirname,
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
    // vendor photos are portrait phone shots shown in a 3:4 grid
    imageSizes: [128, 170, 220, 260, 320],
  },
};

export default nextConfig;
