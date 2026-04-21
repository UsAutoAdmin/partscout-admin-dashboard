"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Papa from "papaparse";

interface RawCsvRow {
  [key: string]: string;
}

interface Yard {
  id: string;
  name: string;
  city: string;
  state: string;
  url: string;
  chainType: string;
}

interface MatchedPart {
  part_id: string;
  year: number;
  make: string;
  model: string;
  part_name: string;
  variation: string | null;
  sell_through: number | null;
  sell_price: number | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  row: string | null;
  space: string | null;
  arrival_date: string | null;
}

interface Vehicle {
  year: number | null;
  make: string | null;
  model: string | null;
  row: string | null;
  space: string | null;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  zipCode: string;
  selected: boolean;
  yard?: Yard;
  distance?: number;
  yardTooFar?: boolean;
  geoCity?: string;
  yardError?: string;
  processStatus?: "idle" | "extracting" | "matching" | "saving" | "done" | "error" | "skipped";
  processError?: string;
  vehicles?: Vehicle[];
  matchedParts?: MatchedPart[];
  pickSheetId?: string;
  shareToken?: string;
  shareUrl?: string;
  editedParts?: MatchedPart[];
  emailStatus?: "pending" | "sending" | "sent" | "error";
  emailError?: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-\.]+/g, "");
}

function findField(row: RawCsvRow, ...candidates: string[]): string {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeHeader(k), v]),
  );
  for (const c of candidates) {
    if (normalized[c] !== undefined) return normalized[c]?.trim() ?? "";
  }
  return "";
}

function parseMembers(rows: RawCsvRow[]): Member[] {
  return rows
    .filter((r) => Object.values(r).some((v) => v?.trim()))
    .map((row, i) => ({
      id: `m-${i}-${Date.now()}`,
      firstName: findField(row, "firstname", "first", "fname"),
      lastName: findField(row, "lastname", "last", "lname"),
      email: findField(row, "email", "emailaddress", "mail"),
      zipCode: findField(row, "zipcode", "zip", "postal", "postalcode"),
      selected: true,
    }));
}

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { n: 1, label: "Upload CSV" },
    { n: 2, label: "Assign Yards" },
    { n: 3, label: "Generate" },
    { n: 4, label: "Preview & Edit" },
    { n: 5, label: "Send Emails" },
  ];
  return (
    <div className="mb-10 flex items-center justify-center">
      {steps.map((s, idx) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all ${
                current === s.n
                  ? "border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-500/20"
                  : current > s.n
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-gray-200 bg-white text-gray-400 dark:border-gray-700 dark:bg-gray-900"
              }`}
            >
              {current > s.n ? "✓" : s.n}
            </div>
            <span
              className={`mt-1.5 whitespace-nowrap text-xs font-medium ${
                current === s.n
                  ? "text-brand-600 dark:text-brand-400"
                  : current > s.n
                    ? "text-green-600 dark:text-green-400"
                    : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`mx-1 mb-5 h-0.5 w-16 ${
                current > s.n ? "bg-green-400" : "bg-gray-200 dark:bg-gray-800"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Badge({
  children,
  color = "gray",
}: {
  children: React.ReactNode;
  color?: "gray" | "green" | "blue" | "red" | "yellow";
}) {
  const colors = {
    gray: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
    green: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    red: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    yellow: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}
    >
      {children}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-current" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function PickSheetModal({
  member,
  onClose,
  onSaveParts,
}: {
  member: Member;
  onClose: () => void;
  onSaveParts: (parts: MatchedPart[]) => void;
}) {
  const [parts, setParts] = useState<MatchedPart[]>(
    member.editedParts ?? member.matchedParts ?? [],
  );

  const byVehicle = parts.reduce<
    Record<string, { label: string; row: string | null; space: string | null; parts: MatchedPart[] }>
  >((acc, p) => {
    const key = `${p.vehicle_year} ${p.vehicle_make} ${p.vehicle_model}|${p.row ?? ""}|${p.space ?? ""}`;
    if (!acc[key]) {
      acc[key] = {
        label: `${p.vehicle_year} ${p.vehicle_make} ${p.vehicle_model}`,
        row: p.row,
        space: p.space,
        parts: [],
      };
    }
    const dedupKey = `${p.part_name}|${p.variation ?? ""}`;
    if (!acc[key].parts.some((e) => `${e.part_name}|${e.variation ?? ""}` === dedupKey)) {
      acc[key].parts.push(p);
    }
    return acc;
  }, {});

  const removePart = (
    partName: string,
    variation: string | null,
    vehicleKey: string,
  ) => {
    setParts((prev) =>
      prev.filter((p) => {
        const key = `${p.vehicle_year} ${p.vehicle_make} ${p.vehicle_model}|${p.row ?? ""}|${p.space ?? ""}`;
        return !(
          key === vehicleKey &&
          p.part_name === partName &&
          (p.variation ?? null) === (variation ?? null)
        );
      }),
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
              {member.firstName} {member.lastName}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {parts.length} parts · {member.yard?.name}, {member.yard?.city}
            </p>
          </div>
          <div className="flex gap-2">
            {member.shareUrl && (
              <a
                href={`${process.env.NEXT_PUBLIC_APP_URL || ""}${member.shareUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Open ↗
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {parts.length === 0 ? (
            <p className="py-8 text-center text-gray-400">All parts removed.</p>
          ) : (
            Object.entries(byVehicle).map(([vehicleKey, group]) => (
              <div key={vehicleKey}>
                <h3 className="mb-2 border-b border-gray-100 dark:border-gray-800 pb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {group.label}
                  {group.row && (
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      Row {group.row}
                      {group.space ? `, Space ${group.space}` : ""}
                    </span>
                  )}
                </h3>
                <div className="space-y-1">
                  {group.parts.map((p) => (
                    <div
                      key={`${p.part_name}-${p.variation ?? ""}-${vehicleKey}`}
                      className="group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {p.part_name}
                        </span>
                        {p.variation && (
                          <span className="ml-2 text-xs text-gray-400">{p.variation}</span>
                        )}
                      </div>
                      <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                        {p.sell_through != null && (
                          <Badge color="blue">{p.sell_through.toFixed(0)}% ST</Badge>
                        )}
                        {p.sell_price != null && (
                          <Badge color="green">${p.sell_price.toFixed(0)}</Badge>
                        )}
                        <button
                          onClick={() => removePart(p.part_name, p.variation, vehicleKey)}
                          className="p-1 text-red-400 opacity-0 transition-all group-hover:opacity-100 hover:text-red-600"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between rounded-b-2xl border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-6 py-4">
          <p className="text-sm text-gray-500">{parts.length} parts remaining</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSaveParts(parts);
                onClose();
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmailAutomationClient() {
  const [step, setStep] = useState<Step>(1);
  const [members, setMembers] = useState<Member[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);

  const [isSending, setIsSending] = useState(false);
  const [isAutoSending, setIsAutoSending] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [autoStatusLine, setAutoStatusLine] = useState<string | null>(null);
  const [maxRandomGapMinutes, setMaxRandomGapMinutes] = useState(5);
  const [enforceMinPartsToSend, setEnforceMinPartsToSend] = useState(true);
  const [minPartsExclusive, setMinPartsExclusive] = useState(10);
  const [trackEngagement, setTrackEngagement] = useState(true);
  const [communityName, setCommunityName] = useState("the Auto Salvage Hub");
  const [senderName, setSenderName] = useState("Chase Eriksson");
  const [customMessage, setCustomMessage] = useState(
    "If you haven't flipped any parts watch the full free course in the community to get started. Come back to Part Scout once you've made some money, but don't wait too long as the founding membership with a lifetime price lock is limited.",
  );
  const [showSettings, setShowSettings] = useState(false);

  const [previewMember, setPreviewMember] = useState<Member | null>(null);

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    if (!file.name.endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      return;
    }
    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = parseMembers(results.data);
        if (!parsed.length) {
          setParseError("No valid rows found in CSV.");
          return;
        }
        setMembers(parsed);
        setStep(2);
      },
      error: (err) => setParseError(err.message),
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const selected = members.filter((m) => m.selected);

  const updateMember = (id: string, patch: Partial<Member>) =>
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const getPartCount = (m: Member) =>
    m.editedParts?.length ?? m.matchedParts?.length ?? 0;

  const membersRef = useRef(members);
  const maxGapMinutesRef = useRef(maxRandomGapMinutes);
  const autoRunIdRef = useRef(0);
  const autoPausedRef = useRef(false);
  const sendConfigRef = useRef({
    communityName,
    senderName,
    customMessage,
    trackEngagement,
    enforceMinPartsToSend,
    minPartsExclusive,
  });

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    maxGapMinutesRef.current = maxRandomGapMinutes;
  }, [maxRandomGapMinutes]);

  useEffect(() => {
    sendConfigRef.current = {
      communityName,
      senderName,
      customMessage,
      trackEngagement,
      enforceMinPartsToSend,
      minPartsExclusive,
    };
  }, [
    communityName,
    senderName,
    customMessage,
    trackEngagement,
    enforceMinPartsToSend,
    minPartsExclusive,
  ]);

  useEffect(
    () => () => {
      autoRunIdRef.current += 1;
    },
    [],
  );

  const postSendEmail = async (member: Member): Promise<boolean> => {
    const cfg = sendConfigRef.current;
    const parts = member.editedParts ?? member.matchedParts ?? [];
    if (cfg.enforceMinPartsToSend && parts.length <= cfg.minPartsExclusive) return false;
    if (!cfg.enforceMinPartsToSend && parts.length === 0) return false;
    updateMember(member.id, { emailStatus: "sending" });
    try {
      const res = await fetch("/api/email-automation/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          shareUrl: member.shareUrl,
          yardName: member.yard?.name ?? "",
          yardCity: member.yard?.city ?? "",
          yardState: member.yard?.state ?? "",
          partCount: parts.length,
          vehicleCount: member.vehicles?.length ?? 0,
          communityName: cfg.communityName,
          senderName: cfg.senderName,
          customMessage: cfg.customMessage,
          crmTracking: cfg.trackEngagement,
          zip: member.zipCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        updateMember(member.id, { emailStatus: "error", emailError: data.error });
        return false;
      }
      updateMember(member.id, { emailStatus: "sent" });
      return true;
    } catch (err) {
      updateMember(member.id, {
        emailStatus: "error",
        emailError: err instanceof Error ? err.message : "Network error",
      });
      return false;
    }
  };

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  function formatApproxDuration(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }

  const startAutoSend = async () => {
    const runId = ++autoRunIdRef.current;
    autoPausedRef.current = false;
    setAutoPaused(false);
    setIsAutoSending(true);
    setAutoStatusLine("Preparing queue…");

    const cfg = sendConfigRef.current;
    const queueIds = membersRef.current
      .filter((m) => {
        if (!m.selected || m.yardTooFar || !m.shareUrl) return false;
        const n = m.editedParts?.length ?? m.matchedParts?.length ?? 0;
        if (n === 0) return false;
        if (cfg.enforceMinPartsToSend && n <= cfg.minPartsExclusive) return false;
        if (m.emailStatus === "sent" || m.emailStatus === "sending") return false;
        return true;
      })
      .map((m) => m.id);

    if (!queueIds.length) {
      setAutoStatusLine(null);
      setIsAutoSending(false);
      return;
    }

    try {
      for (let i = 0; i < queueIds.length; i++) {
        if (autoRunIdRef.current !== runId) break;

        while (autoPausedRef.current && autoRunIdRef.current === runId) {
          setAutoStatusLine("Paused — click Resume to continue");
          await sleep(300);
        }
        if (autoRunIdRef.current !== runId) break;

        const member = membersRef.current.find((m) => m.id === queueIds[i]);
        if (!member || !member.selected || !member.shareUrl) continue;
        const partCount = member.editedParts?.length ?? member.matchedParts?.length ?? 0;
        if (partCount === 0) continue;
        if (
          sendConfigRef.current.enforceMinPartsToSend &&
          partCount <= sendConfigRef.current.minPartsExclusive
        ) {
          continue;
        }
        if (member.emailStatus === "sent") continue;

        setAutoStatusLine(
          `Sending to ${member.firstName} ${member.lastName}… (${i + 1}/${queueIds.length})`,
        );
        await postSendEmail(member);

        const hasMore = i < queueIds.length - 1;
        if (hasMore && autoRunIdRef.current === runId) {
          while (autoPausedRef.current && autoRunIdRef.current === runId) {
            setAutoStatusLine("Paused — click Resume to continue");
            await sleep(300);
          }
          if (autoRunIdRef.current !== runId) break;

          const maxMs = maxGapMinutesRef.current * 60 * 1000;
          const delay = Math.random() * maxMs;
          if (delay > 500) {
            setAutoStatusLine(`Next send in ~${formatApproxDuration(delay)}…`);
            await sleep(delay);
          } else {
            await sleep(0);
          }
        }
      }
    } finally {
      if (autoRunIdRef.current === runId) {
        setIsAutoSending(false);
        setAutoPaused(false);
        autoPausedRef.current = false;
        setAutoStatusLine(null);
      }
    }
  };

  const pauseAutoSend = () => {
    autoPausedRef.current = true;
    setAutoPaused(true);
  };

  const resumeAutoSend = () => {
    autoPausedRef.current = false;
    setAutoPaused(false);
  };

  const findYards = async () => {
    const targets = selected;
    if (!targets.length) return;

    setMembers((prev) =>
      prev.map((m) => ({
        ...m,
        yard: undefined,
        distance: undefined,
        yardTooFar: undefined,
        yardError: undefined,
        geoCity: undefined,
      })),
    );

    const res = await fetch("/api/email-automation/find-yards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        members: targets.map((m) => ({ id: m.id, zipCode: m.zipCode })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }

    const { results } = data as {
      results: Record<
        string,
        {
          yard: Yard | null;
          distance: number | null;
          geoCity: string | null;
          error: string | null;
          tooFarForDrive?: boolean;
        }
      >;
    };

    setMembers((prev) =>
      prev.map((m) => {
        const r = results[m.id];
        if (!r) return m;
        return {
          ...m,
          yard: r.yard ?? undefined,
          distance: r.distance ?? undefined,
          yardTooFar: r.tooFarForDrive === true,
          geoCity: r.geoCity ?? undefined,
          yardError: r.error ?? undefined,
        };
      }),
    );
  };

  const generatePickSheets = async () => {
    const keepExisting = (m: Member) => m.processStatus === "done" && Boolean(m.shareUrl);
    const targets = selected.filter((m) => m.yard && !m.yardTooFar && !keepExisting(m));

    setIsGenerating(true);
    setGenerateProgress(0);

    const clearedPick = {
      matchedParts: undefined,
      vehicles: undefined,
      pickSheetId: undefined,
      shareToken: undefined,
      shareUrl: undefined,
      editedParts: undefined,
    };

    setMembers((prev) =>
      prev.map((m) => {
        if (!m.selected || !m.yard) return m;
        if (m.yardTooFar) {
          return {
            ...m,
            processStatus: "skipped" as const,
            processError: "Nearest yard is over 30 miles — not included in this run",
            ...clearedPick,
          };
        }
        if (keepExisting(m)) return m;
        return {
          ...m,
          processStatus: "idle" as const,
          processError: undefined,
          ...clearedPick,
        };
      }),
    );

    if (!targets.length) {
      setIsGenerating(false);
      setGenerateProgress(0);
      return;
    }

    let done = 0;
    for (const member of targets) {
      updateMember(member.id, { processStatus: "extracting" });
      try {
        const res = await fetch("/api/email-automation/process-member", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            yardUrl: member.yard!.url,
            yardName: `${member.yard!.name} ${member.yard!.city}`,
            yardCity: member.yard!.city,
            memberName: `${member.firstName} ${member.lastName}`,
            memberId: member.id,
          }),
        });

        const text = await res.text();
        let data: {
          error?: string;
          vehicles?: Vehicle[];
          matchedParts?: MatchedPart[];
          pickSheetId?: string;
          shareToken?: string;
          shareUrl?: string;
        };
        try {
          data = JSON.parse(text);
        } catch {
          updateMember(member.id, {
            processStatus: "error",
            processError: `Server error: ${text.slice(0, 200)}`,
          });
          continue;
        }
        if (!res.ok) {
          updateMember(member.id, {
            processStatus: "error",
            processError: data.error || `HTTP ${res.status}`,
          });
        } else {
          updateMember(member.id, {
            processStatus: "done",
            vehicles: data.vehicles,
            matchedParts: data.matchedParts,
            editedParts: data.matchedParts,
            pickSheetId: data.pickSheetId,
            shareToken: data.shareToken,
            shareUrl: data.shareUrl,
          });
        }
      } catch (err) {
        updateMember(member.id, {
          processStatus: "error",
          processError: err instanceof Error ? err.message : "Network error",
        });
      } finally {
        done++;
        setGenerateProgress(Math.round((done / targets.length) * 100));
      }
    }

    setIsGenerating(false);
  };

  const sendEmails = async () => {
    const targets = selected.filter((m) => {
      if (m.yardTooFar || !m.shareUrl) return false;
      if (m.emailStatus === "sent" || m.emailStatus === "sending") return false;
      const n = getPartCount(m);
      if (n === 0) return false;
      if (enforceMinPartsToSend && n <= minPartsExclusive) return false;
      return true;
    });
    if (!targets.length) return;

    setIsSending(true);
    for (const member of targets) {
      await postSendEmail(member);
    }
    setIsSending(false);
  };

  const readyForStep3 = selected.some((m) => m.yard && !m.yardTooFar);
  const readyForStep4 = selected.some((m) => m.processStatus === "done");
  const readyForStep5 = selected.some(
    (m) => !m.yardTooFar && m.shareUrl && (m.editedParts?.length ?? 0) > 0,
  );

  const passesSendPartThreshold = (m: Member) => {
    const n = getPartCount(m);
    if (n === 0) return false;
    if (!enforceMinPartsToSend) return true;
    return n > minPartsExclusive;
  };

  const sendListMembers = selected.filter(
    (m) => !m.yardTooFar && m.shareUrl && getPartCount(m) > 0,
  );

  const pendingSendableCount = sendListMembers.filter(
    (m) =>
      passesSendPartThreshold(m) &&
      m.emailStatus !== "sent" &&
      m.emailStatus !== "sending",
  ).length;

  const hasSendableQueue = pendingSendableCount > 0;

  const heldBackByMinParts = enforceMinPartsToSend
    ? sendListMembers.filter(
        (m) =>
          m.emailStatus !== "sent" &&
          m.emailStatus !== "sending" &&
          getPartCount(m) > 0 &&
          !passesSendPartThreshold(m),
      ).length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white/90">
            Email Automation
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Upload members → find their nearest yard → generate pick sheets → send personalized
            Gmail emails
          </p>
        </div>

        <StepIndicator current={step} />

        {step === 1 && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-8 shadow-sm">
            <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white/90">
              Upload Member CSV
            </h2>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              Expected columns:{" "}
              <span className="rounded bg-gray-100 dark:bg-gray-800 px-1 font-mono text-xs">
                First Name, Last Name, Email, Zip Code
              </span>
            </p>

            <div
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-16 text-center transition-all ${
                isDragging
                  ? "border-brand-400 bg-brand-50 dark:bg-brand-500/[0.08]"
                  : "border-gray-200 dark:border-gray-700 hover:border-brand-300 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              }`}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/[0.12]">
                  <svg
                    className="h-7 w-7 text-brand-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-medium text-gray-700 dark:text-gray-200">
                    Drop your CSV here
                  </p>
                  <p className="mt-1 text-sm text-gray-400">or click to browse</p>
                </div>
              </div>
            </div>

            {parseError && (
              <p className="mt-4 rounded-lg border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-600 dark:text-red-300">
                {parseError}
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">Members</h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {selected.length} of {members.length} selected
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    setMembers((p) => p.map((m) => ({ ...m, selected: true })))
                  }
                  className="text-sm text-brand-600 hover:underline"
                >
                  Select all
                </button>
                <button
                  onClick={() =>
                    setMembers((p) => p.map((m) => ({ ...m, selected: false })))
                  }
                  className="text-sm text-gray-400 hover:underline"
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02]">
                  <tr>
                    <th className="w-10 px-4 py-3" />
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                      ZIP
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                      Nearest Yard
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      className={`transition-colors ${
                        m.selected
                          ? "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                          : "bg-gray-50/50 dark:bg-white/[0.01] opacity-50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={m.selected}
                          onChange={(e) => updateMember(m.id, { selected: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white/90">
                        {m.firstName} {m.lastName}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 font-mono text-xs">
                          {m.zipCode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {m.yardError ? (
                          <span className="text-xs text-red-500">{m.yardError}</span>
                        ) : m.yard ? (
                          <div>
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                              {m.yard.name} – {m.yard.city}, {m.yard.state}
                            </p>
                            <p className="text-xs text-gray-400">{m.distance} mi away</p>
                            {m.yardTooFar && (
                              <p className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                <span aria-hidden>⚠</span> Over 30 mi — long drive
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected.some((m) => m.yard && m.yardTooFar) && (
              <div className="border-t border-amber-100 bg-amber-50 px-6 py-3 text-xs leading-relaxed text-amber-950">
                <strong className="font-semibold">Over 30 miles:</strong> selected members whose
                nearest yard is farther than 30 miles are <strong>not</strong> included in pick
                sheet generation, preview, or send.
              </div>
            )}

            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-6 py-4">
              <button
                onClick={() => {
                  setStep(1);
                  setMembers([]);
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back
              </button>
              <div className="flex gap-3">
                <button
                  onClick={findYards}
                  disabled={!selected.length}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  🔍 Find Closest Yard
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!readyForStep3}
                  className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Generate Pick Sheets →
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
                  Generate Pick Sheets
                </h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Extracts yard inventory · matches your database parts · saves shareable pick
                  sheets.
                </p>
              </div>
              {!isGenerating && !readyForStep4 && (
                <button
                  onClick={generatePickSheets}
                  disabled={!readyForStep3}
                  className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-40"
                >
                  ▶ Start Generation
                </button>
              )}
            </div>

            {isGenerating && (
              <div className="border-b border-gray-100 dark:border-gray-800 px-6 py-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Processing…
                  </span>
                  <span className="text-sm text-gray-500">{generateProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-2 rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${generateProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {selected
                .filter((m) => m.yard)
                .map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white/90">
                        {m.firstName} {m.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {m.yard?.name}, {m.yard?.city} · {m.zipCode}
                        {m.distance != null && ` · ${m.distance} mi`}
                        {m.yardTooFar && (
                          <span className="ml-2 font-semibold text-amber-700">
                            · Over 30 mi (long drive)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      {m.yardTooFar || m.processStatus === "skipped" ? (
                        <div className="max-w-[220px] text-right">
                          <Badge color="yellow">Skipped</Badge>
                          <p className="mt-0.5 text-xs leading-snug text-amber-900">
                            Nearest yard over 30 mi — not generated or emailed
                          </p>
                        </div>
                      ) : !m.processStatus || m.processStatus === "idle" ? (
                        <Badge color="gray">Queued</Badge>
                      ) : m.processStatus === "extracting" ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-brand-600">
                          <Spinner /> Extracting vehicles…
                        </span>
                      ) : m.processStatus === "done" ? (
                        <div className="flex items-center gap-2">
                          <Badge color="green">✓ Done</Badge>
                          <span className="text-xs text-gray-400">
                            {m.matchedParts?.length} parts · {m.vehicles?.length} vehicles
                          </span>
                        </div>
                      ) : m.processStatus === "error" ? (
                        <div>
                          <Badge color="red">Error</Badge>
                          <p className="mt-0.5 max-w-xs truncate text-xs text-red-500">
                            {m.processError}
                          </p>
                        </div>
                      ) : (
                        <Badge color="gray">—</Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-6 py-4">
              <button
                onClick={() => setStep(2)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!readyForStep4}
                className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                Preview & Edit →
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] shadow-sm">
            <div className="border-b border-gray-100 dark:border-gray-800 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
                Preview & Edit Pick Sheets
              </h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Review each pick sheet and remove any parts before sending
              </p>
            </div>

            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {selected
                .filter((m) => m.processStatus === "done")
                .map((m) => {
                  const parts = m.editedParts ?? m.matchedParts ?? [];
                  return (
                    <div key={m.id} className="flex items-center justify-between px-6 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white/90">
                            {m.firstName} {m.lastName}
                          </p>
                          {parts.length === 0 && <Badge color="red">No parts</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {m.email} · {m.yard?.name}, {m.yard?.city}
                        </p>
                      </div>
                      <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                        <span className="text-xs text-gray-500">
                          {parts.length} parts · {m.vehicles?.length} vehicles
                        </span>
                        <button
                          onClick={() => setPreviewMember(m)}
                          className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          Preview & Edit
                        </button>
                        {m.shareUrl && (
                          <a
                            href={`${process.env.NEXT_PUBLIC_APP_URL || ""}${m.shareUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-brand-200 bg-brand-50 dark:border-brand-700 dark:bg-brand-500/[0.12] px-3 py-1.5 text-sm font-medium text-brand-700 dark:text-brand-300 transition-colors hover:bg-brand-100 dark:hover:bg-brand-500/[0.2]"
                          >
                            Open ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              {selected
                .filter((m) => m.processStatus === "error")
                .map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between bg-red-50/30 dark:bg-red-900/10 px-6 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white/90">
                        {m.firstName} {m.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-red-500">{m.processError}</p>
                    </div>
                    <Badge color="red">Failed</Badge>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-6 py-4">
              <button
                onClick={() => setStep(3)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(5)}
                disabled={!readyForStep5}
                className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                Send Emails →
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] px-6 py-4 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white/90">
                Send filter
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Bulk send and automatic send only include rows that pass this rule.
              </p>
              <label className="mt-4 flex cursor-pointer select-none items-start gap-3">
                <input
                  type="checkbox"
                  checked={enforceMinPartsToSend}
                  onChange={(e) => setEnforceMinPartsToSend(e.target.checked)}
                  className="mt-1 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    Only send if the pick sheet has{" "}
                    <span className="font-semibold">more than</span>{" "}
                    <input
                      type="number"
                      min={0}
                      max={500}
                      disabled={!enforceMinPartsToSend}
                      value={minPartsExclusive}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isNaN(v)) return;
                        setMinPartsExclusive(Math.min(500, Math.max(0, v)));
                      }}
                      className="mx-1 w-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-center font-mono text-sm disabled:bg-gray-50 dark:disabled:bg-gray-900 disabled:opacity-40"
                    />{" "}
                    parts (default 10 → requires 11+ parts).
                  </span>
                </div>
              </label>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] shadow-sm">
              <button
                className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                onClick={() => setShowSettings((v) => !v)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-gray-900 dark:text-white/90">
                    ⚙ Email Settings
                  </span>
                  <Badge color="green">Gmail (OAuth)</Badge>
                </div>
                <svg
                  className={`h-5 w-5 text-gray-400 transition-transform ${showSettings ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showSettings && (
                <div className="space-y-5 border-t border-gray-100 dark:border-gray-800 px-6 pb-6 pt-5">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-400">
                      Email Content
                    </p>

                    <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] p-4 font-serif text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                      <p>
                        Hey <span className="text-brand-600">[First Name]</span>, thanks for being a
                        member of{" "}
                        <span className="font-medium text-brand-600">{communityName || "…"}</span>.
                        As promised, here is your custom pick sheet for your local junkyard should
                        you decide to be a founding member of Part Scout.
                      </p>
                      <p className="break-all text-xs text-brand-500 underline">
                        [pick sheet link]
                      </p>
                      <p className="whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                        {customMessage}
                      </p>
                      <p>
                        Best,
                        <br />
                        <span className="font-medium">{senderName || "…"}</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Community Name
                        </label>
                        <input
                          type="text"
                          value={communityName}
                          onChange={(e) => setCommunityName(e.target.value)}
                          placeholder="the Auto Salvage Hub"
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Sign-off Name
                        </label>
                        <input
                          type="text"
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                          placeholder="Chase Eriksson"
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Body Message (after the link)
                      </label>
                      <textarea
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        rows={4}
                        className="w-full resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <label className="flex cursor-pointer select-none items-center gap-2">
                    <input
                      type="checkbox"
                      checked={trackEngagement}
                      onChange={(e) => setTrackEngagement(e.target.checked)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Track opens &amp; link clicks (shown in{" "}
                      <a href="/users" className="font-medium text-brand-600 underline">
                        CRM
                      </a>
                      )
                    </span>
                  </label>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                    <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Uses your connected business Gmail
                    </p>
                    <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      Same credentials as the admin inbox:{" "}
                      <code className="rounded bg-slate-200 dark:bg-slate-700 px-1">
                        GOOGLE_CLIENT_ID
                      </code>
                      ,{" "}
                      <code className="rounded bg-slate-200 dark:bg-slate-700 px-1">
                        GOOGLE_CLIENT_SECRET
                      </code>
                      ,{" "}
                      <code className="rounded bg-slate-200 dark:bg-slate-700 px-1">
                        GOOGLE_REFRESH_TOKEN
                      </code>
                      , and{" "}
                      <code className="rounded bg-slate-200 dark:bg-slate-700 px-1">
                        GOOGLE_EMAIL_ADDRESS
                      </code>
                      . OAuth scopes must include{" "}
                      <code className="rounded bg-slate-200 dark:bg-slate-700 px-1">
                        gmail.compose
                      </code>{" "}
                      or{" "}
                      <code className="rounded bg-slate-200 dark:bg-slate-700 px-1">
                        gmail.send
                      </code>
                      .
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] shadow-sm">
              <div className="border-b border-gray-100 dark:border-gray-800 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
                  Automatic send
                </h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Sends queued emails one at a time with a random pause between each.
                </p>
              </div>
              <div className="space-y-5 px-6 py-5">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <label
                      htmlFor="gap-slider"
                      className="text-sm font-medium text-gray-800 dark:text-gray-200"
                    >
                      Max time between sends
                    </label>
                    <span className="text-sm font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                      0–{maxRandomGapMinutes} min (random each gap)
                    </span>
                  </div>
                  <input
                    id="gap-slider"
                    type="range"
                    min={0}
                    max={5}
                    step={0.5}
                    value={maxRandomGapMinutes}
                    onChange={(e) => setMaxRandomGapMinutes(parseFloat(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700 accent-brand-600"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">
                    Left = back-to-back. Right = up to 5 min between emails (random each time).
                  </p>
                </div>

                {autoStatusLine && (
                  <p className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                    {autoStatusLine}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  {!isAutoSending ? (
                    <button
                      type="button"
                      onClick={() => void startAutoSend()}
                      disabled={!hasSendableQueue}
                      className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-40"
                    >
                      Start
                    </button>
                  ) : autoPaused ? (
                    <button
                      type="button"
                      onClick={resumeAutoSend}
                      className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={pauseAutoSend}
                      className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
                    >
                      Pause
                    </button>
                  )}
                  {isAutoSending && (
                    <span className="text-xs text-gray-500">
                      {autoPaused ? "Paused" : "Running…"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] shadow-sm">
              <div className="border-b border-gray-100 dark:border-gray-800 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
                  Ready to Send
                </h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {pendingSendableCount}
                  </span>{" "}
                  will be sent
                  {heldBackByMinParts > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="font-medium text-amber-800">{heldBackByMinParts}</span>{" "}
                      below part minimum
                    </>
                  )}
                  {sendListMembers.length === 0 && " — no sheets with parts yet"}
                </p>
              </div>

              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {sendListMembers.map((m) => {
                  const parts = m.editedParts ?? m.matchedParts ?? [];
                  const willSend = passesSendPartThreshold(m);
                  return (
                    <div
                      key={m.id}
                      className="group/row flex items-center justify-between px-6 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white/90">
                            {m.firstName} {m.lastName}
                          </p>
                          {enforceMinPartsToSend && !willSend && m.emailStatus !== "sent" && (
                            <Badge color="yellow">Below part min</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {m.email} · {parts.length} parts · {m.yard?.name}, {m.yard?.city}
                        </p>
                      </div>
                      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
                        {m.emailStatus === "sending" ? (
                          <span className="flex items-center gap-1.5 text-xs text-brand-600">
                            <Spinner /> Sending…
                          </span>
                        ) : m.emailStatus === "sent" ? (
                          <Badge color="green">✓ Sent</Badge>
                        ) : m.emailStatus === "error" ? (
                          <div>
                            <Badge color="red">Failed</Badge>
                            <p className="mt-0.5 max-w-xs text-xs text-red-500">{m.emailError}</p>
                          </div>
                        ) : !willSend && enforceMinPartsToSend ? (
                          <Badge color="gray">Held</Badge>
                        ) : (
                          <>
                            <Badge color="gray">Queued</Badge>
                            <button
                              onClick={() => updateMember(m.id, { selected: false })}
                              className="p-1 text-red-400 opacity-0 transition-all group-hover/row:opacity-100 hover:text-red-600"
                              title="Remove from send list"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-6 py-4">
                <button
                  onClick={() => setStep(4)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
                <button
                  onClick={() => void sendEmails()}
                  disabled={isSending || isAutoSending || !hasSendableQueue}
                  className="flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-2 text-sm font-semibold text-gray-800 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                  title="Send every queued email immediately with no delays"
                >
                  {isSending ? (
                    <>
                      <Spinner /> Sending…
                    </>
                  ) : (
                    "✉ Send all now (no delay)"
                  )}
                </button>
              </div>
            </div>

            {!isSending && selected.some((m) => m.emailStatus === "sent") && (
              <div className="rounded-2xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 px-6 py-4">
                <p className="font-semibold text-green-800 dark:text-green-300">
                  ✓ {selected.filter((m) => m.emailStatus === "sent").length} emails sent
                  successfully!
                </p>
                <p className="mt-0.5 text-sm text-green-600 dark:text-green-400">
                  Each member received a personalized pick sheet link.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {previewMember && (
        <PickSheetModal
          member={previewMember}
          onClose={() => setPreviewMember(null)}
          onSaveParts={(parts) => {
            updateMember(previewMember.id, { editedParts: parts });
            setPreviewMember(null);
          }}
        />
      )}
    </div>
  );
}
