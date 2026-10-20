export function readdirSync() { return []; }
export function existsSync() { return false; }
export function readFileSync() { throw Object.assign(new Error('no fs'), {code: 'ENOENT'}); }
export default {readdirSync, existsSync, readFileSync};
