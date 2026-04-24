import path from 'node:path';
import { readFileSync } from 'node:fs';
import { globSync } from 'tinyglobby';
import type { WorkspacePackage } from './types.js';

interface PackageJson {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  [key: string]: unknown;
}

const readJson = <T>(filePath: string): T => JSON.parse(readFileSync(filePath, 'utf8')) as T;

const getWorkspacePatterns = (packageJson: PackageJson): string[] => {
  const workspaces = packageJson.workspaces;
  if (Array.isArray(workspaces)) {
    return workspaces;
  }
  if (workspaces && typeof workspaces === 'object' && Array.isArray(workspaces.packages)) {
    return workspaces.packages;
  }
  return [];
};

const deepFindTeam = (value: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = deepFindTeam(entry);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (typeof value !== 'object') {
    return undefined;
  }

  const obj = value as Record<string, unknown>;
  const maybeTeam = obj.team;
  if (typeof maybeTeam === 'string' && maybeTeam.trim().length > 0) {
    return maybeTeam.trim();
  }

  for (const nested of Object.values(obj)) {
    const found = deepFindTeam(nested);
    if (found) {
      return found;
    }
  }
  return undefined;
};

export const discoverWorkspacePackages = (rootDir: string): WorkspacePackage[] => {
  const rootPackagePath = path.join(rootDir, 'package.json');
  const rootPackage = readJson<PackageJson>(rootPackagePath);
  const patterns = getWorkspacePatterns(rootPackage);

  if (patterns.length === 0) {
    throw new Error('No workspaces found in root package.json. Add a workspaces field before running diff-split.');
  }

  const packageJsonPaths = globSync(
    patterns.map((pattern) => `${pattern.replace(/\/$/, '')}/package.json`),
    {
      cwd: rootDir,
      absolute: false,
      onlyFiles: true
    }
  );

  return packageJsonPaths
    .map((relativePackageJsonPath) => {
      const packageJsonPath = path.join(rootDir, relativePackageJsonPath);
      const pkgJson = readJson<PackageJson>(packageJsonPath);
      const dir = path
        .dirname(relativePackageJsonPath)
        .split(path.sep)
        .join('/');

      return {
        name: pkgJson.name ?? dir,
        dir,
        packageJsonPath,
        owner: deepFindTeam(pkgJson)
      } as WorkspacePackage;
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
};

export const mapFilesToPackages = (
  files: string[],
  packages: WorkspacePackage[]
): Map<string, string[]> => {
  const byPackage = new Map<string, string[]>();
  for (const pkg of packages) {
    byPackage.set(pkg.name, []);
  }
  byPackage.set('root', []);

  const sortedPackages = [...packages].sort((a, b) => b.dir.length - a.dir.length);

  for (const file of files) {
    const normalized = file.split(path.sep).join('/');
    const match = sortedPackages.find(
      (pkg) => normalized === pkg.dir || normalized.startsWith(`${pkg.dir}/`)
    );
    const key = match ? match.name : 'root';
    byPackage.get(key)?.push(normalized);
  }

  return byPackage;
};
