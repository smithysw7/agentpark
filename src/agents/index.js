import claudeCode from './claude-code.js';
import zcode from './zcode.js';
import codex from './codex.js';
import gemini from './gemini.js';
import hermes from './hermes.js';
import dsh from './dsh.js';
import agentsShared from './shared-agents.js';

export const AGENTS = [claudeCode, zcode, codex, gemini, hermes, dsh, agentsShared];

export function getAgent(idOrExec) {
  if (!idOrExec) return null;
  return (
    AGENTS.find((a) => a.id === idOrExec) ||
    AGENTS.find((a) => a.exec && a.exec === idOrExec) ||
    null
  );
}

export function detectedAgents() {
  return AGENTS.filter((a) => a.detect());
}
