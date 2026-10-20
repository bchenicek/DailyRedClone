export function isDeepStrictEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export const inspect = {custom: Symbol.for('nodejs.util.inspect.custom')};
export default {isDeepStrictEqual, inspect};
