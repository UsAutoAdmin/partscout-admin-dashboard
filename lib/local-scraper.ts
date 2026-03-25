import { promises as fs } from "fs";
import path from "path";
import { execFile, execSync } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const scraperRoot = "/Users/chaseeriksson/Downloads/Seed Database";
const pidPath = path.join(scraperRoot, "scraper.pid");
const logPath = path.join(scraperRoot, "logs", "scraper.log");
const dashboardUrl = "http://localhost:3847";

export type LocalScraperStatus = {
  root: string;
  pid: number | null;
  running: boolean;
  logTail: string[];
  dashboardUrl: string;
};

async function readPidFile(): Promise<number | null> {
  try {
    const raw = await fs.readFile(pidPath, "utf8");
    const pid = Number(raw.trim());
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function findLiveScraperPid(): number | null {
  try {
    const output = execSync(`ps aux | grep -F '${scraperRoot}' | grep 'src/index.ts' | grep -v grep`, {
      encoding: "utf8",
      shell: "/bin/zsh",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (!output) return null;
    const firstLine = output.split(/\r?\n/)[0];
    const parts = firstLine.trim().split(/\s+/);
    const pid = Number(parts[1]);
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

async function resolvePid(): Promise<number | null> {
  const filePid = await readPidFile();
  if (await isRunning(filePid)) return filePid;
  return findLiveScraperPid();
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
  const pid = await resolvePid();
  return {
    root: scraperRoot,
    pid,
    running: await isRunning(pid),
    logTail: await readLogTail(),
    dashboardUrl,
  };
}

export async function startLocalScraper(): Promise<LocalScraperStatus> {
  const current = await getLocalScraperStatus();
  if (current.running) return current;
  await execFileAsync("bash", ["run-detached.sh"], { cwd: scraperRoot });
  return getLocalScraperStatus();
}

export async function stopLocalScraper(): Promise<LocalScraperStatus> {
  const pid = await resolvePid();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return getLocalScraperStatus();
}

export async function restartLocalScraper(): Promise<LocalScraperStatus> {
  await stopLocalScraper();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return startLocalScraper();
}
