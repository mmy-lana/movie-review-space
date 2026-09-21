/**
 * Temporary resolver hook plus self-registration, loaded via
 * `node --import ./__alias-register.mjs`.
 *
 * Implements the `@/*` → `src/*` tsconfig path alias for the Phase 1
 * verification harness. Deleted after the run.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'src');

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];

function firstExisting(candidates) {
  return candidates.find((candidate) => existsSync(candidate));
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = path.join(sourceRoot, specifier.slice(2));
    const found = firstExisting([
      base,
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
    ]);
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }

  // Bundler-style extensionless relative imports (e.g. `./indexdb`).
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    path.extname(specifier) === ''
  ) {
    const parentPath = fileURLToPath(context.parentURL ?? pathToFileURL(projectRoot).href);
    const base = path.resolve(path.dirname(parentPath), specifier);
    const found = firstExisting([
      ...EXTENSIONS.map((ext) => `${base}${ext}`),
      ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
    ]);
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}

register(import.meta.url, pathToFileURL(`${projectRoot}${path.sep}`).href);
