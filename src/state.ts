import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { RunManifest } from './types.js';

const runsDir = (rootDir: string) => path.join(rootDir, '.diff-split', 'runs');
const snapshotsDir = (rootDir: string) => path.join(rootDir, '.diff-split', 'snapshots');

export const createRunId = (): string => {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
};

export const ensureStateDirs = (rootDir: string): void => {
  mkdirSync(runsDir(rootDir), { recursive: true });
  mkdirSync(snapshotsDir(rootDir), { recursive: true });
};

export const getSnapshotPath = (rootDir: string, runId: string): string =>
  path.join(snapshotsDir(rootDir), `${runId}.patch`);

export const writeSnapshot = (snapshotPath: string, patchContent: string): void => {
  writeFileSync(snapshotPath, patchContent, 'utf8');
};

export const writeManifest = (manifest: RunManifest): string => {
  ensureStateDirs(manifest.rootDir);
  const filePath = path.join(runsDir(manifest.rootDir), `${manifest.id}.json`);
  writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf8');
  return filePath;
};

export const readManifest = (rootDir: string, runId: string): RunManifest => {
  const filePath = path.join(runsDir(rootDir), `${runId}.json`);
  const contents = readFileSync(filePath, 'utf8');
  return JSON.parse(contents) as RunManifest;
};
