"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle, Upload } from "lucide-react";
import { ImportWizard } from "@/components/import/ImportWizard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { parseCsv, rowsToRecords, downloadCsv } from "@/lib/csv-parse";
import {
  LEAD_TEMPLATE_HEADERS,
  LEAD_FIELD_OPTIONS,
  autoMapLeadColumns,
  validateAllLeads,
  requiredLeadFieldsMapped,
  type LeadFieldKey,
  type ValidatedLeadRow,
  type RowStatus,
} from "@/lib/lead-import";
import { BUDGET_TIER_LABELS } from "@/lib/types";

const STEPS = ["Upload", "Map columns", "Review", "Done"];
const MAX_BYTES = 5 * 1024 * 1024;

interface LeadImportWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

export function LeadImportWizard({ onClose, onComplete }: LeadImportWizardProps) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, LeadFieldKey>>({});
  const [validated, setValidated] = useState<ValidatedLeadRow[]>([]);
  const [filter, setFilter] = useState<"all" | RowStatus>("all");
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [result, setResult] = useState<{
    imported: number;
    merged: number;
    skipped: number;
    errors?: string[];
    notices?: string[];
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (file.size > MAX_BYTES) {
      alert("File must be under 5MB");
      return;
    }
    void file.text().then((text) => {
      const { headers: h, rows } = parseCsv(text);
      if (!h.length) return;
      setFileName(file.name);
      setHeaders(h);
      setRecords(rowsToRecords(h, rows));
      setColumnMap(autoMapLeadColumns(h));
      setStep(1);
    });
  }, []);

  const missingRequired = useMemo(
    () => requiredLeadFieldsMapped(columnMap),
    [columnMap]
  );

  const duplicateFields = useMemo(() => {
    const counts = new Map<LeadFieldKey, string[]>();
    for (const [col, field] of Object.entries(columnMap)) {
      if (field === "skip") continue;
      const list = counts.get(field) ?? [];
      list.push(col);
      counts.set(field, list);
    }
    const dups = new Set<LeadFieldKey>();
    counts.forEach((cols, field) => {
      if (cols.length > 1) dups.add(field);
    });
    return dups;
  }, [columnMap]);

  const summary = useMemo(() => {
    const ready = validated.filter((r) => r.status === "ready").length;
    const warning = validated.filter((r) => r.status === "warning").length;
    const error = validated.filter((r) => r.status === "error").length;
    return { ready, warning, error, importable: ready + warning };
  }, [validated]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return validated;
    return validated.filter((r) => r.status === filter);
  }, [validated, filter]);

  const pageRows = filteredRows.slice(page * 20, page * 20 + 20);

  function downloadTemplate() {
    downloadCsv(
      "olready-lead-import-template.csv",
      [...LEAD_TEMPLATE_HEADERS],
      [
        [
          "Priya Sharma",
          "9876543210",
          "priya@email.com",
          "2026-09-15",
          "Delhi",
          "north",
          "Taj Palace",
          "150000",
          "tier1",
          "Instagram",
          "Mehndi/Wedding",
        ],
      ]
    );
  }

  function runValidation() {
    setValidated(validateAllLeads(records, columnMap));
    setStep(2);
    setPage(0);
  }

  async function runImport() {
    const rows = validated.filter((r) => r.status !== "error");
    const payload = rows.map((r) => ({
      brideName: r.brideName,
      phone: r.phone,
      email: r.email,
      eventDate: r.eventDate || null,
      city: r.city,
      region: r.region,
      eventLocation: r.eventLocation,
      budgetAmount: r.budgetAmount,
      budgetTier: r.budgetTier,
      source: r.source,
      ceremonies: r.ceremonies,
    }));

    const CHUNK_SIZE = 20;
    let imported = 0;
    let merged = 0;
    let skipped = 0;
    const errors: string[] = [];
    const notices: string[] = [];

    setImporting(true);
    setImportProgress({ done: 0, total: payload.length });

    try {
      for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        const chunk = payload.slice(i, i + CHUNK_SIZE);
        setImportProgress({ done: i, total: payload.length });

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 120_000);
        let res: Response;
        try {
          res = await fetch("/api/upload/import-leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: chunk }),
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeout);
        }

        const raw = await res.text();
        let json: {
          data: {
            imported: number;
            merged?: number;
            skipped: number;
            errors?: string[];
            notices?: string[];
          } | null;
          error: string | null;
        };
        try {
          json = raw
            ? (JSON.parse(raw) as typeof json)
            : { data: null, error: null };
        } catch {
          throw new Error(
            res.ok ? "Import failed — invalid server response" : `Import failed (${res.status})`
          );
        }

        if (!res.ok || !json.data) {
          throw new Error(json.error ?? "Import failed");
        }

        imported += json.data.imported;
        merged += json.data.merged ?? 0;
        skipped += json.data.skipped;
        if (json.data.errors?.length) errors.push(...json.data.errors);
        if (json.data.notices?.length) notices.push(...json.data.notices);
        setImportProgress({
          done: Math.min(i + chunk.length, payload.length),
          total: payload.length,
        });
      }

      setResult({
        imported,
        merged,
        skipped,
        errors: errors.length ? errors : undefined,
        notices: notices.length ? notices : undefined,
      });
      setStep(3);
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === "AbortError"
          ? "Import timed out — try again or use a smaller file"
          : e instanceof Error
            ? e.message
            : "Import failed";
      alert(message);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  function resetWizard() {
    setStep(0);
    setFileName("");
    setHeaders([]);
    setRecords([]);
    setColumnMap({});
    setValidated([]);
    setResult(null);
  }

  function downloadErrors() {
    const errs = validated.filter((r) => r.status === "error");
    downloadCsv(
      "lead-import-errors.csv",
      [...LEAD_TEMPLATE_HEADERS, "error_reason"],
      errs.map((r) => [
        r.brideName,
        r.phone,
        r.email ?? "",
        r.eventDate ?? "",
        r.city,
        r.region ?? "",
        r.eventLocation ?? "",
        String(r.budgetAmount ?? ""),
        r.budgetTier,
        r.source ?? "",
        r.ceremonies.join("/"),
        r.issues.map((i) => i.message).join("; "),
      ])
    );
  }

  if (step === 3 && result) {
    return (
      <ImportWizard steps={STEPS} currentStep={3} hideFooter>
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle className="mb-4 h-16 w-16 text-emerald-500" />
          <h2 className="text-xl font-bold text-brand">Import complete</h2>
          <span className="mt-4 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-medium text-emerald-800">
            {result.imported} new lead{result.imported === 1 ? "" : "s"} added to verification queue
          </span>
          {result.merged > 0 && (
            <span className="mt-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-900">
              {result.merged} row{result.merged === 1 ? "" : "s"} merged into existing pending leads
            </span>
          )}
          {result.skipped > 0 && (
            <span className="mt-2 rounded-full bg-red-100 px-4 py-1.5 text-sm font-medium text-red-800">
              {result.skipped} rows skipped
            </span>
          )}
          {result.notices?.length ? (
            <ul className="mt-4 max-h-40 w-full max-w-lg overflow-y-auto rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-left text-xs text-amber-950">
              {result.notices.slice(0, 20).map((note, i) => (
                <li key={i} className="py-0.5">
                  {note}
                </li>
              ))}
            </ul>
          ) : null}
          {result.errors?.length ? (
            <ul className="mt-4 max-h-40 w-full max-w-lg overflow-y-auto rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-left text-xs text-red-900">
              {result.errors.slice(0, 20).map((err, i) => (
                <li key={i} className="py-0.5">
                  {err}
                </li>
              ))}
              {result.errors.length > 20 ? (
                <li className="py-0.5 text-red-700">…and {result.errors.length - 20} more</li>
              ) : null}
            </ul>
          ) : null}
          <div className="mt-8 flex gap-3">
            <Button variant="secondary" onClick={resetWizard}>
              Import another file
            </Button>
            <Button
              onClick={() => {
                onComplete();
                onClose();
              }}
            >
              Go to verification queue
            </Button>
          </div>
        </div>
      </ImportWizard>
    );
  }

  return (
    <ImportWizard
      steps={STEPS}
      currentStep={step}
      onBack={step > 0 && step < 3 ? () => setStep((s) => s - 1) : undefined}
      onNext={
        step === 0
          ? undefined
          : step === 1
            ? runValidation
            : step === 2
              ? runImport
              : undefined
      }
      nextLabel={
        step === 2
          ? importing
            ? importProgress
              ? `Importing ${importProgress.done}/${importProgress.total}…`
              : "Importing…"
            : `Import ${summary.importable} rows →`
          : undefined
      }
      nextDisabled={
        step === 1
          ? missingRequired.length > 0 || duplicateFields.size > 0
          : step === 2
            ? summary.importable === 0 || importing
            : false
      }
      hideFooter={step === 0}
    >
      {step === 0 && (
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) processFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 transition-colors",
              dragOver ? "border-accent bg-accent/5" : "border-slate-300"
            )}
          >
            <Upload className="mb-3 h-10 w-10 text-slate-400" />
            <p className="font-medium text-text">
              Drag a CSV file here or click to browse
            </p>
            <p className="mt-1 text-sm text-slate-muted">
              Supports .csv files up to 5MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processFile(f);
              }}
            />
          </div>
          <button
            type="button"
            className="text-sm font-medium text-accent hover:underline"
            onClick={downloadTemplate}
          >
            Download template ↓
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {fileName && (
            <p className="text-sm text-slate-muted">
              <span className="font-medium text-text">{fileName}</span> —{" "}
              {records.length} rows detected
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="text-xs font-semibold uppercase text-slate-muted">
              Your CSV column
            </p>
            <p className="text-xs font-semibold uppercase text-slate-muted">
              Maps to field
            </p>
          </div>
          {headers.map((header) => {
            const field = columnMap[header] ?? "skip";
            const isDup = field !== "skip" && duplicateFields.has(field);
            const sample = records[0]?.[header] ?? "";
            return (
              <div
                key={header}
                className={cn(
                  "grid gap-2 border-b border-slate-100 pb-3 sm:grid-cols-2",
                  isDup && "rounded-lg bg-amber-50 px-2"
                )}
              >
                <div>
                  <p className="text-sm font-medium">{header}</p>
                  {isDup && (
                    <p className="text-xs text-amber-700">Duplicate mapping</p>
                  )}
                </div>
                <div>
                  <Select
                    options={LEAD_FIELD_OPTIONS.map((o) => ({
                      value: o.key,
                      label: o.required ? `${o.label}*` : o.label,
                    }))}
                    value={field}
                    onChange={(e) =>
                      setColumnMap((m) => ({
                        ...m,
                        [header]: e.target.value as LeadFieldKey,
                      }))
                    }
                  />
                  {sample && (
                    <p className="mt-1 text-xs italic text-slate-muted">
                      Sample: {sample}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {missingRequired.length > 0 && (
            <p className="text-sm text-red-600">
              Map required fields:{" "}
              {missingRequired
                .map((k) => LEAD_FIELD_OPTIONS.find((o) => o.key === k)?.label)
                .join(", ")}
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-emerald-700">✅ {summary.ready} rows ready</span>
            <span className="text-amber-700">
              ⚠ {summary.warning} rows with warnings
            </span>
            <span className="text-red-600">❌ {summary.error} rows with errors</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "ready", "warning", "error"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  setPage(0);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize",
                  filter === f ? "bg-brand text-white" : "bg-slate-100"
                )}
              >
                {f === "all" ? "All" : f}
              </button>
            ))}
            {summary.error > 0 && (
              <Button size="sm" variant="secondary" onClick={downloadErrors}>
                Download errors as CSV
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[800px] text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-muted">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Bride</th>
                  <th className="p-2">Phone</th>
                  <th className="p-2">Event</th>
                  <th className="p-2">City</th>
                  <th className="p-2">Region</th>
                  <th className="p-2">Tier</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Ceremonies</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <Fragment key={row.rowIndex}>
                    <tr
                      className={cn(
                        "cursor-pointer border-t border-slate-100",
                        row.status === "ready" && "border-l-4 border-l-emerald-500",
                        row.status === "warning" && "border-l-4 border-l-amber-500",
                        row.status === "error" && "border-l-4 border-l-red-500"
                      )}
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === row.rowIndex ? null : row.rowIndex
                        )
                      }
                    >
                      <td className="p-2">{row.rowIndex}</td>
                      <td className="p-2 capitalize">{row.status}</td>
                      <td className="p-2">{row.brideName}</td>
                      <td className="p-2 font-mono">{row.phone}</td>
                      <td className="p-2">{row.eventDate ?? "—"}</td>
                      <td className="p-2">{row.city}</td>
                      <td className="p-2 capitalize">{row.region ?? "At verify"}</td>
                      <td className="p-2">
                        {BUDGET_TIER_LABELS[row.budgetTier]}
                      </td>
                      <td className="p-2">{row.source ?? "—"}</td>
                      <td className="p-2">{row.ceremonies.join(", ")}</td>
                    </tr>
                    {expandedRow === row.rowIndex && row.issues.length > 0 && (
                      <tr key={`${row.rowIndex}-err`}>
                        <td colSpan={10} className="bg-slate-50 p-3">
                          <ul className="space-y-1 text-xs">
                            {row.issues.map((issue, i) => (
                              <li
                                key={i}
                                className={
                                  issue.severity === "error"
                                    ? "text-red-600"
                                    : "text-amber-700"
                                }
                              >
                                {issue.field}: {issue.message}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between text-sm">
            <Button
              size="sm"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-slate-muted">
              Page {page + 1} / {Math.max(1, Math.ceil(filteredRows.length / 20))}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={(page + 1) * 20 >= filteredRows.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </ImportWizard>
  );
}
