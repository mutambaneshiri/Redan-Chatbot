/**
 * Loads .env.local for CLI scripts.
 *
 * Next.js loads .env.local automatically for the web app, but plain `tsx`
 * scripts do not — without this, `npm run eval` would run with no API key and
 * report every case as a failure. Import this FIRST in any CLI entry point.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
