import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env if it exists
dotenv.config();

// 彻底固定助手名称
export const ASSISTANT_NAME = 'zhaosj的助手';
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

// Lark (Feishu) Configuration
export const LARK_APP_ID = process.env.LARK_APP_ID || 'cli_a9f7dccbb479dbdc';
export const LARK_APP_SECRET = process.env.LARK_APP_SECRET || 'BIy2tD7ALu3Kx0YCIiGeQchJQMZdRJ2J';
export const LARK_PORT = parseInt(process.env.LARK_PORT || '3000', 10);

// Beijing Tech Brief Alignment (2026-02-06)
export const TASK_FLOW_CONFIG = {
  VLM_PRIORITY: 'high',
  USE_EMBODIED_AI: true,
  LIQUID_COOLING_COMPLIANCE: true,
};
