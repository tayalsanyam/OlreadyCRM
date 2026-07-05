"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle, Upload } from "lucide-react";
import { ImportWizard } from "@/components/import/ImportWizard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { parseCsv, rowsToRecords, downloadCsv } from "@/lib/csv-parse";
import {
  MUA_TEMPLATE_HEADERS,
  MUA_FIELD_OPTIONS,
  MUA_IMPORT_PROFILE_HINTS,
  MUA_IMPORT_PROFILE_LABELS,
  autoMapMuaColumns,
  validateAllMuas,
  requiredMuaFieldsMapped,
  templateSampleRow,
  type MuaFieldKey,
  type MuaImportProfile,
  type ValidatedMuaRow,
  type MuaRowStatus,
  type ImportMuaRowPayload,
} from "@/lib/mua-import";
import { PLAN_TIER_LABELS } from "@/lib/types";
import { importMuasInChunks } from "@/lib/mua-import-client";

const STEPS = ["Profile", "Upload", "Map columns", "Review", "Done"];
const MAX_BYTES = 5 * 1024 * 1024;

const PROFILES: MuaImportProfile[] = ["prospect", "roster", "plan_customer"];

interface MuaImportWizardProps {
  onClose: () => void;
  onComplete: () => void;
  initialProfile?: MuaImportProfile;
}

export function MuaImportWizard({
  onClose,
  onComplete,
  initialProfile = "prospect",
}: MuaImportWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<MuaImportProfile>(initialProfile);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, MuaFieldKey>>({});
  const [validated, setValidated] = useState<ValidatedMuaRow[]>([]);
  const [filter, setFilter] = useState<"all" | MuaRowStatus>("all");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ processedRows: number; totalRows: number } | null>(
    null,
  );
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    duplicates?: Array<{ name: string; reason: string }>;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (file.size > MAX_BYTES) return;
    void file.text().then((text) => {
      const { headers: h, rows } = parseCsv(text);
      if (!h.length) return;
      setFileName(file.name);
      setHeaders(h);
      setRecords(rowsToRecords(h, rows));
      setColumnMap(autoMapMuaColumns(h));
      setStep(2);
    });
  }, []);

  const missingRequired = useMemo(
    () => requiredMuaFieldsMapped(columnMap, profile),
    [columnMap, profile],
  );

  const summary = useMemo(() => {
    const ready = validated.filter((r) => r.status === "ready").length;
    const warning = validated.filter((r) => r.status === "warning").length;
    const error = validated.filter((r) => r.status === "error").length;
    return { ready, warning, error, importable: ready + warning };
  }, [validated]);

  const filtered = useMemo(() => {
    if (filter === "all") return validated;
    return validated.filter((r) => r.status === filter);
  }, [validated, filter]);

  function downloadTemplate() {
    downloadCsv(`olready-mua-${profile}.csv`, [...MUA_TEMPLATE_HEADERS], [
      templateSampleRow(profile),
    ]);
  }

  function rowPayload(r: ValidatedMuaRow): ImportMuaRowPayload {
    return {
      name: r.name,
      city: r.city,
      regions: r.regions,
      phone: r.phone,
      email: r.email,
      source: r.source,
      instagram: r.instagram,
      whatsapp: r.whatsapp,
      bio: r.bio,
      planTier: r.planTier,
      planExpiry: r.planExpiry,
      leadCap: r.leadCap,
      leadBudget: r.leadBudget,
      planStates: r.planStates,
      planRegions: r.planRegions,
      planCities: r.planCities,
    };
  }

  async function runImport() {
    const rows = validated.filter((r) => r.status !== "error").map(rowPayload);
    setImporting(true);
    setImportProgress({ processedRows: 0, totalRows: rows.length });
    try {
      const data = await importMuasInChunks({
        profile,
        rows,
        onProgress: (p) => setImportProgress({ processedRows: p.processedRows, totalRows: p.totalRows }),
      });
      setResult(data);
      setStep(4);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  if (step === 4 && result) {
    return (
      <ImportWizard steps={STEPS} currentStep={4} hideFooter>
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle className="mb-4 h-16 w-16 text-emerald-500" />
          <h2 className="text-xl font-bold">Upload complete</h2>
          <span className="mt-4 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-medium text-emerald-800">
            {result.imported} MUAs imported
          </span>
          {result.skipped > 0 && (
            <p className="mt-2 text-sm text-amber-800">{result.skipped} rows skipped</p>
          )}
          <p className="mt-3 max-w-md text-sm text-slate-muted">
            Each MUA was added to the roster with an unassigned sales pipeline. Assign Sales RMs
            from <strong>Unassigned MUAs</strong> or use <strong>Add to sales pipeline</strong> on
            Manage MUAs.
          </p>
          <div className="mt-8 flex gap-3">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Upload another
            </Button>
            <Button
              onClick={() => {
                onComplete();
                onClose();
              }}
            >
              View MUAs
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
      onBack={step > 0 && step < 4 ? () => setStep((s) => s - 1) : undefined}
      onNext={
        step === 0
          ? () => setStep(1)
          : step === 2
            ? () => {
                setValidated(validateAllMuas(records, columnMap, profile));
                setStep(3);
              }
            : step === 3
              ? runImport
              : undefined
      }
      nextLabel={
        step === 0
          ? "Continue →"
          : step === 3
            ? importing
              ? "Importing…"
              : `Import ${summary.importable} rows →`
            : undefined
      }
      nextDisabled={
        step === 2
          ? missingRequired.length > 0
          : step === 3
            ? summary.importable === 0 || importing
            : false
      }
      hideFooter={step === 1}
    >
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-muted">
            Choose what you are uploading. Validation and required columns depend on the profile.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProfile(p)}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition-colors",
                  profile === p ? "border-brand bg-brand/5" : "border-slate-200 hover:border-slate-300",
                )}
              >
                <p className="font-semibold text-brand">{MUA_IMPORT_PROFILE_LABELS[p]}</p>
                <p className="mt-2 text-xs text-slate-muted">{MUA_IMPORT_PROFILE_HINTS[p]}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div
          className={cn(
            "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed py-14",
            dragOver ? "border-accent bg-accent/5" : "border-slate-300",
          )}
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
        >
          <Upload className="mb-3 h-10 w-10 text-slate-400" />
          <p className="font-medium">Drag a CSV file here or click to browse</p>
          <p className="mt-1 text-sm text-slate-muted">
            Profile: {MUA_IMPORT_PROFILE_LABELS[profile]}
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
          <button
            type="button"
            className="mt-4 text-sm text-accent hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              downloadTemplate();
            }}
          >
            Download template for {MUA_IMPORT_PROFILE_LABELS[profile]} ↓
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          <p className="text-sm text-slate-muted">
            {fileName} — {records.length} rows · {MUA_IMPORT_PROFILE_LABELS[profile]}
          </p>
          {missingRequired.length > 0 && (
            <p className="text-sm text-red-600">
              Map required columns:{" "}
              {missingRequired
                .map((k) => MUA_FIELD_OPTIONS.find((o) => o.key === k)?.label ?? k)
                .join(", ")}
            </p>
          )}
          {headers.map((header) => (
            <div key={header} className="grid gap-2 border-b pb-3 sm:grid-cols-2">
              <p className="text-sm font-medium">{header}</p>
              <Select
                options={MUA_FIELD_OPTIONS.map((o) => ({
                  value: o.key,
                  label: o.required ? `${o.label}*` : o.label,
                }))}
                value={columnMap[header] ?? "skip"}
                onChange={(e) =>
                  setColumnMap((m) => ({
                    ...m,
                    [header]: e.target.value as MuaFieldKey,
                  }))
                }
              />
            </div>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          {importing && importProgress ? (
            <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-brand">
              Importing {importProgress.processedRows} / {importProgress.totalRows} rows…
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="text-emerald-700">✅ {summary.ready} ready</span>
            <span className="text-amber-700">⚠ {summary.warning} warnings</span>
            <span className="text-red-600">❌ {summary.error} errors</span>
            {(["all", "ready", "warning", "error"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs capitalize",
                  filter === f ? "bg-brand text-white" : "bg-slate-100",
                )}
                onClick={() => setFilter(f === "all" ? "all" : f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="max-h-[45vh] overflow-x-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">City</th>
                  <th className="p-2 text-left">Phone</th>
                  <th className="p-2 text-left">Plan</th>
                  <th className="p-2 text-left">Issues</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={cn(
                      "border-t",
                      row.status === "ready" && "border-l-4 border-l-emerald-500",
                      row.status === "warning" && "border-l-4 border-l-amber-500",
                      row.status === "error" && "border-l-4 border-l-red-500",
                    )}
                  >
                    <td className="p-2 font-medium">{row.name}</td>
                    <td className="p-2">{row.city}</td>
                    <td className="p-2">{row.phone ?? "—"}</td>
                    <td className="p-2">
                      {row.planTier ? (
                        <Badge>{PLAN_TIER_LABELS[row.planTier]}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-[200px] p-2 text-slate-muted">
                      {row.issues.map((i) => i.message).join("; ") || "—"}
                    </td>
                    <td className="p-2 capitalize">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ImportWizard>
  );
}
