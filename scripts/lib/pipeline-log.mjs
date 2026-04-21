/**
 * Utility for scripts to update pipeline state and append log entries.
 * Usage:
 *   import { updatePhase, appendLog, readState, writeState } from "./lib/pipeline-log.mjs";
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const STATE_PATH = resolve(import.meta.dirname, "../../data/pipeline/state.json");
const LOG_PATH = resolve(import.meta.dirname, "../../data/pipeline/log.jsonl");

export function ensureDir() {
  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readState() {
  ensureDir();
  if (!existsSync(STATE_PATH)) return null;
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

export function writeState(state) {
  ensureDir();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function updatePhase(phaseId, updates) {
  const state = readState();
  if (!state) return;
  const phase = state.phases.find((p) => p.id === phaseId);
  if (phase) Object.assign(phase, updates);
  writeState(state);
}

export function updateSummary(updates) {
  const state = readState();
  if (!state) return;
  Object.assign(state.summary, updates);
  writeState(state);
}

export function appendLog(level, message) {
  ensureDir();
  const entry = { ts: new Date().toISOString(), level, message };
  appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
}

export function log(message) { appendLog("info", message); }
export function warn(message) { appendLog("warn", message); }
export function error(message) { appendLog("error", message); }
export function success(message) { appendLog("success", message); }
