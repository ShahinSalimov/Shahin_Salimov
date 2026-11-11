/**
 * Standalone edition: a single offline HTML file (no server, no Node.js).
 * Built with `npm run build:standalone`. Uses hash routing so it works from file://.
 */
export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';
