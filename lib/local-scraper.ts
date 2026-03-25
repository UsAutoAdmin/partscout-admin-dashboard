import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const scraperRoot = "/Users/chaseeriksson/Downloads/Seed Database";
const pidPath = path.join(scraperRoot, "scraper.pid");
const logPath = path.join(scraperRoot, "logs", "scraper.log");

export type LocalScraperStatus = {
  root: string;
  pid: number | null;
  running: boolean;
  logTail: string[];
  dashboardUrl: string;
};

async function readPid(): Promise<number | null> {
  try {
    const raw = await fs.readFile(pidPath, "utf8");
    const pid = Number(raw.trim());
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function isRunning(pid: number | null): Promise<boolean> {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLogTail(lines = 40): Promise<string[]> {
  try {
    const raw = await fs.readFile(logPath, "utf8");
    return raw.trim().split(/\r?\n/).slice(-lines);
  } catch {
    return [];
  }
}

export async function getLocalScraperStatus(): Promise<LocalScraperStatus> {
  const pid = await readPid();
  return {
    root: scraperRoot,
    pid,
    running: await isRunning(pid),
    logTail: await readLogTail(),
    dashboardUrl: "http://localhost:3847",
  };
}

export async function startLocalScraper(): Promise<LocalScraperStatus> {
  await execFileAsync("bash", ["run-detached.sh"], { cwd: scraperRoot });
  return getLocalScraperStatus();
}

export async function stopLocalScraper(): Promise<LocalScraperStatus> {
  const pid = await readPid();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  return getLocalScraperStatus();
}

export async function restartLocalScraper(): Promise<LocalScraperStatus> {
  await stopLocalScraper();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return startLocalScraper();
}
