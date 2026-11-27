import { isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Resolve a URL pathname inside a static root. Returns null when decoding fails or when the
 * resolved path escapes the root, including encoded traversal segments.
 */
export function staticPath(rootDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const root = resolve(rootDir);
  const path = join(root, decoded);
  const rel = relative(root, path);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return path;
}
