/**
 * Merge chunk results from all 3 minis back into queue.json.
 * Pulls results from Mini 2 and 3 via SCP, reads Mini 1 locally.
 * Can be run repeatedly — only merges when results files exist.
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "part-review");
const QUEUE_FILE = path.join(DATA_DIR, "queue.json");
const DONE_FILE = path.join(DATA_DIR, "done.json");

const MINIS = [
  { name: "Mini 1 (local)", resultFile: path.join(DATA_DIR, "chunk-1-results.json"), remote: null },
  { name: "Mini 2", resultFile: path.join(DATA_DIR, "chunk-2-results.json"), remote: "chaseeriksson@100.100.6.101:~/part-review/chunk-2-results.json" },
  { name: "Mini 3", resultFile: path.join(DATA_DIR, "chunk-3-results.json"), remote: "chaseeriksson@100.68.192.57:~/part-review/chunk-3-results.json" },
];

function pull(mini) {
  if (!mini.remote) return fs.existsSync(mini.resultFile);
  try {
    execSync(`scp -o ConnectTimeout=5 ${mini.remote} ${mini.resultFile} 2>/dev/null`, { stdio: "pipe" });
    return fs.existsSync(mini.resultFile);
  } catch {
    return false;
  }
}

function countStatus(items) {
  const pending = items.filter((i) => i.status === "pending").length;
  const scraped = items.filter((i) => i.status === "scraped" && !i.removed).length;
  const removed = items.filter((i) => i.removed).length;
  return { total: items.length, pending, scraped, removed };
}

async function main() {
  console.log("Pulling results from all minis...\n");

  let allReady = true;
  const chunks = [];

  for (const mini of MINIS) {
    const found = pull(mini);
    if (found) {
      const data = JSON.parse(fs.readFileSync(mini.resultFile, "utf8"));
      const stats = countStatus(data);
      console.log(`  ${mini.name}: ${stats.total} parts — ${stats.scraped} kept, ${stats.removed} removed, ${stats.pending} pending`);
      if (stats.pending > 0) allReady = false;
      chunks.push(...data);
    } else {
      console.log(`  ${mini.name}: no results yet`);
      allReady = false;
    }
  }

  // Load already-completed items from before the split
  const done = fs.existsSync(DONE_FILE)
    ? JSON.parse(fs.readFileSync(DONE_FILE, "utf8"))
    : [];

  const merged = [...done, ...chunks];
  const stats = countStatus(merged);

  console.log(`\nMerged: ${stats.total} total — ${stats.scraped} kept, ${stats.removed} removed, ${stats.pending} still pending`);

  if (merged.length > 0) {
    // Sort by queue_position
    merged.sort((a, b) => a.queue_position - b.queue_position);
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(merged, null, 2));
    console.log(`Saved to ${QUEUE_FILE}`);
  }

  if (allReady && chunks.length > 0) {
    console.log("\n=== ALL CHUNKS COMPLETE ===");
    console.log(`Final: ${stats.scraped} verified parts, ${stats.removed} removed`);
  } else {
    console.log("\nSome chunks still in progress — run again later to update.");
  }
}

main().catch(console.error);
