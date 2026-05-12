import { execSync } from "node:child_process";

import type { NextConfig } from "next";

function resolveCommitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: resolveCommitSha(),
  },
  // The Marketing Report PDF route reads bundled TTF fonts via process.cwd()
  // at render time. Next's output file tracer can't detect dynamic paths
  // (path.join with process.cwd()), so we list the assets explicitly so
  // Vercel includes them in the function bundle.
  outputFileTracingIncludes: {
    "/api/deals/[id]/marketing-report.pdf": ["./src/lib/pdf/fonts/*.ttf"],
  },
};

export default nextConfig;
