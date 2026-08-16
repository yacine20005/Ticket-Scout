import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

dotenv.config();

/**
 * Environment schema validation using Zod.
 */
const envSchema = z.object({
  EVENT_URL: z.string().url({ message: 'EVENT_URL must be a valid URL string' }),
  DISCORD_WEBHOOK_URL: z.string().optional(),
  BROWSER_PROFILE_DIR: z.string().default('data/browser-profile'),
  STATE_FILE: z.string().default('data/state.json'),
  SCREENSHOT_DIR: z.string().default('data/screenshots'),
  HEADLESS: z.string().default('true').transform(val => val !== 'false'),
  MAX_JITTER_SECONDS: z.string().default('0').transform(val => Math.max(0, parseInt(val, 10) || 0)),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Configuration Error (.env validation failed):');
  console.error(parsedEnv.error.format());
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const config = {
  eventUrl: parsedEnv.data.EVENT_URL,
  discordWebhookUrl: parsedEnv.data.DISCORD_WEBHOOK_URL || '',
  browserProfileDir: path.resolve(rootDir, parsedEnv.data.BROWSER_PROFILE_DIR),
  stateFile: path.resolve(rootDir, parsedEnv.data.STATE_FILE),
  screenshotDir: path.resolve(rootDir, parsedEnv.data.SCREENSHOT_DIR),
  headless: parsedEnv.data.HEADLESS,
  maxJitterSeconds: parsedEnv.data.MAX_JITTER_SECONDS,
};
