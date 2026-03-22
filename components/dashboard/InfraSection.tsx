"use client";

import { MetricCard } from "../MetricCard";
import SectionHeader from "../SectionHeader";
import { fmtNum } from "@/lib/format";

interface InfraSectionProps {
  dirTotal: number;
  dirVerified: number;
  totalYards: number;
  totalRuns: number;
}

export default function InfraSection({
  dirTotal, dirVerified, totalYards, totalRuns,
}: InfraSectionProps) {
  return (
    <section>
      <SectionHeader title="Infrastructure" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Junkyard Directory" value={fmtNum(dirTotal)} />
        <MetricCard label="Verified Extractors" value={dirVerified} color="success" />
        <MetricCard label="Monitored Yards" value={totalYards} color="info" />
        <MetricCard label="Monitoring Runs" value={fmtNum(totalRuns)} color="info" />
      </div>
    </section>
  );
}
