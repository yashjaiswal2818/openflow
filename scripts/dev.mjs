#!/usr/bin/env node
/**
 * One-command dev runner: engine daemon + Vite.
 *
 *   npm run dev        -> engine (127.0.0.1:18488) + Studio (0.0.0.0:1420)
 *   npm run dev:web    -> Studio only (connects to an engine you started)
 *
 * The engine is optional: if Python or the engine module is missing the UI
 * still boots and shows an honest "engine offline" state.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const children = new Set();
let shuttingDown = false;

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    ...options,
  });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && (signal || code)) {
      console.log(`\n[openflow] ${command} exited (${signal ?? code}); shutting down.`);
      shutdown(code ?? 0);
    }
  });
  child.on('error', (error) => {
    children.delete(child);
    console.error(`[openflow] could not start ${command}: ${error.message}`);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 200);
}

function findPython() {
  for (const candidate of ['python3', 'python']) {
    const probe = spawn(candidate, ['-c', 'import sys; sys.exit(0)'], { stdio: 'ignore' });
    if (probe.pid) {
      probe.kill();
      return candidate;
    }
  }
  return null;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const python = findPython();
if (python && existsSync(join(root, 'engine', 'server.py'))) {
  console.log('[openflow] starting local engine on http://127.0.0.1:18488');
  run(python, ['-m', 'engine.server'], { cwd: root });
} else {
  console.warn('[openflow] python3 not found — skipping the engine. The Studio will show "engine offline".');
}

const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(viteBin)) {
  console.error('[openflow] vite is not installed. Run `npm install` first.');
  process.exit(1);
}

console.log('[openflow] starting Studio on http://localhost:1420');
run(process.execPath, [viteBin], { cwd: root });
