import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env if it exists
dotenv.config();

let name = process.env.ASSISTANT_NAME || 'NanoClaw';
// Prevent accidental assignment of log filenames to assistant name
if (name.endsWith('.log') || name.includes('/') || name.includes(' ')) {
  name = 'NanoClaw';
}
export const ASSISTANT_NAME = name;
export const POLL_INTERVAL = 5000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || '/Users/user';

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '300000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(`^@(${escapeRegex(ASSISTANT_NAME)}|小助手)\\b`, 'i');
export const TIMEZONE = process.env.TZ || 'Asia/Shanghai';
