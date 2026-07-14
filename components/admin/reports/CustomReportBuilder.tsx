"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";

type Field = { key: string; label: string };
type FilterDef = { key: string; label: string; type: "text" | "date" | "select" };
type Option = { value: string; label: string };
type Template = { id: string; name: string; config: { fields?: string[]; filters?: Record<string, string> } };

function toCsv(headers: string[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) lines.push(Object.values(row).map(esc).join(","));
  return lines.join("\n");
}

export function CustomReportBuilder({
  title,
  apiBase,
}: {
  title: string;
  apiBase: string;
}) {
  const [fields, setFields] = useState<Field[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtersDef, setFiltersDef] = useState<FilterDef[]>([]);
  const [filterOptions, setFilterOptions] = useState<Record<string, Option[]>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    void fetch(apiBase)
      .then((r) => r.json())
      .then((json: {
        data?: {
          fields?: Field[];
          filters?: FilterDef[];
          filterOptions?: Record<string, Option[]>;
          templates?: Template[];
        };
      }) => {
        const f = json.data?.fields ?? [];
        setFields(f);
        setSelected(f.slice(0, Math.min(6, f.length)).map((x) => x.key));
        setFiltersDef(json.data?.filters ?? []);
        setFilterOptions(json.data?.filterOptions ?? {});
        setTemplates(json.data?.templates ?? []);
      });
  }, [apiBase]);

  const selectedFields = useMemo(
    () => fields.filter((f) => selected.includes(f.key)),
    [fields, selected]
  );

  function toggleField(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function run(nextPage = page) {
    if (selected.length === 0) return;
    setLoading(true);
    const payload = {
      action: "run",
      fields: selected,
      filters,
      page: nextPage,
      pageSize: Number(pageSize) || 50,
    };
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as {
      data?: {
        headers?: string[];
        rows?: Record<string, unknown>[];
        total?: number;
        totalPages?: number;
        page?: number;
      };
      error?: string | null;
    };
    if (!res.ok) {
      setLoading(false);
      alert(json.error ?? "Failed to build report");
      return;
    }
    setHeaders(json.data?.headers ?? []);
    setRows(json.data?.rows ?? []);
    setTotal(json.data?.total ?? 0);
    setTotalPages(json.data?.totalPages ?? 1);
    setPage(json.data?.page ?? nextPage);
    setLoading(false);
  }

  async function saveTemplate() {
    if (!templateName.trim() || selected.length === 0) return;
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveTemplate",
        templateName: templateName.trim(),
        fields: selected,
        filters,
      }),
    });
    const json = (await res.json()) as { data?: { templates?: Template[] }; error?: string };
    if (!res.ok) {
      alert(json.error ?? "Failed to save template");
      return;
    }
    setTemplates(json.data?.templates ?? []);
    setTemplateName("");
  }

  async function deleteTemplate() {
    if (!selectedTemplateId) return;
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteTemplate", templateId: selectedTemplateId }),
    });
    const json = (await res.json()) as { data?: { templates?: Template[] }; error?: string };
    if (!res.ok) {
      alert(json.error ?? "Failed to delete template");
      return;
    }
    setTemplates(json.data?.templates ?? []);
    setSelectedTemplateId("");
  }

  function applyTemplate(id: string) {
    setSelectedTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (Array.isArray(t.config?.fields)) setSelected(t.config.fields);
    if (t.config?.filters && typeof t.config.filters === "object") {
      setFilters(t.config.filters as Record<string, string>);
    }
  }

  function downloadCsv() {
    if (rows.length === 0) return;
    const blob = new Blob([`\uFEFF${toCsv(headers, rows)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "-")}-custom-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-brand">{title}</p>
        <div className="grid gap-2 md:grid-cols-4">
          {filtersDef.map((fd) => (
            <div key={fd.key}>
              {fd.type === "select" ? (
                <label className="text-xs text-slate-muted">
                  {fd.label}
                  <select
                    className="mt-1 w-full rounded border px-2 py-2 text-sm"
                    value={filters[fd.key] ?? ""}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, [fd.key]: e.target.value }))
                    }
                  >
                    <option value="">All</option>
                    {(filterOptions[fd.key] ?? []).map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <Input
                  type={fd.type}
                  label={fd.label}
                  value={filters[fd.key] ?? ""}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, [fd.key]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}
          <Input
            label="Page size"
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {fields.map((f) => (
            <label key={f.key} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={selected.includes(f.key)}
                onChange={() => toggleField(f.key)}
              />
              {f.label}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void run(1)} disabled={loading || selected.length === 0}>
            {loading ? "Building..." : "Build Report"}
          </Button>
          <Button size="sm" variant="secondary" onClick={downloadCsv} disabled={rows.length === 0}>
            Download Page CSV
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <Input
            label="Template name"
            placeholder="e.g. High-risk pipelines"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <div>
            <label className="text-xs text-slate-muted">Saved templates</label>
            <select
              className="mt-1 w-full rounded border px-2 py-2 text-sm"
              value={selectedTemplateId}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">Select template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={() => void saveTemplate()} disabled={!templateName.trim() || selected.length === 0}>
              Save Template
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void deleteTemplate()} disabled={!selectedTemplateId}>
              Delete
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <Table>
          <THead>
            <TR>
              {(selectedFields.length ? selectedFields : [{ key: "none", label: "No fields selected" }]).map((f) => (
                <TH key={f.key}>{f.label}</TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={Math.max(1, selectedFields.length)}>No rows yet</TD>
              </TR>
            ) : (
              rows.map((r, i) => (
                <TR key={i}>
                  {selectedFields.map((f) => (
                    <TD key={f.key}>{String(r[f.key] ?? "")}</TD>
                  ))}
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
      <Card className="flex items-center justify-between">
        <p className="text-sm text-slate-muted">
          Page {page} of {totalPages} · {total} rows
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => void run(page - 1)}>
            Prev
          </Button>
          <Button size="sm" variant="secondary" disabled={page >= totalPages || loading} onClick={() => void run(page + 1)}>
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}
