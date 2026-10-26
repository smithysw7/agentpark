import path from 'node:path';
import { homeDir, exists, walkMaxMtime } from '../util.js';
import { makeJsonMcp } from './json-mcp.js';

const h = () => homeDir();

export default {
  id: 'gemini',
  label: 'Gemini CLI',
  exec: 'gemini',
  detect() {
    return exists(path.join(h(), '.gemini'));
  },
  skillDirs() {
    return [path.join(h(), '.gemini', 'skills')].filter(exists);
  },
  mcp: makeJsonMcp(path.join(h(), '.gemini', 'settings.json'), 'mcpServers'),
  detectLastUsed() {
    return walkMaxMtime(path.join(h(), '.gemini'), { maxEntries: 2000 });
  },
};
