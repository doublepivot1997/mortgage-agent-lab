import fs from "node:fs";

/** Load .env.local for CLI scripts (Next.js does this itself). Never logs values. */
export function loadLocalEnv(): void {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
}
