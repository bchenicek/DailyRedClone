function norm(parts) {
  const out = [];
  for (const part of parts.join('/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return '/' + out.join('/');
}
export function resolve(...p) { let start = 0; for (let i = 0; i < p.length; i++) if (String(p[i]).startsWith('/')) start = i; return norm(p.slice(start)); }
export function join(...p) { return norm(p); }
export function dirname(p) { return norm([p, '..']); }
export function basename(p) { return String(p).split('/').pop(); }
export const sep = '/';
export default {resolve, join, dirname, basename, sep};
