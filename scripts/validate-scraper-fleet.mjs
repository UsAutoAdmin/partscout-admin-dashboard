import { getScraperFleetStatus } from '../lib/scraper-fleet.ts';

const fleet = await getScraperFleetStatus();
console.log(JSON.stringify(fleet, null, 2));
const running = fleet.filter((machine) => machine.running).length;
if (running < 3) {
  console.error(`Expected all 3 machines running, got ${running}`);
  process.exit(1);
}
