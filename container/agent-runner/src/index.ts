/**
 * NanoClaw Agent Runner - Gemini Version
 * Runs inside a container, receives config via stdin, outputs result to stdout
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function callGemini(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Add Gmail MCP context if available
    const gmailConfig = '/home/node/.gmail-mcp/credentials.json';
    let enhancedPrompt = prompt;
    if (fs.existsSync(gmailConfig)) {
      enhancedPrompt = `You have access to Gmail tools via 'npx -y @gongrzhe/server-gmail-autoauth-mcp'.
To send an email, use: [SHELL: echo '{"method": "tools/call", "params": {"name": "send_email", "arguments": {"to": "recipient@example.com", "subject": "Subject", "body": "Body"}}}' | npx -y @gongrzhe/server-gmail-autoauth-mcp