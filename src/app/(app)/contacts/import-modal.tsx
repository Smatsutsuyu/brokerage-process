"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, Check, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { importContacts, type ImportContactRow, type ImportResult } from "./actions";

import type { BuilderOption } from "./contact-modal";

type ImportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  builders: BuilderOption[];
};

// Expected Excel columns (case-insensitive header match). Listed in the
// dialog's help text so users know the format.
//
// "Name" is an alternative to "First Name" + "Last Name" — split on the
// last space at parse time. If a file has both, First/Last take precedence.
//
// "Classification" only applies when the row's builder is being newly
// created. For rows whose builder already exists in the org, the column is
// read but ignored (we don't quietly mutate existing builders via import).
const EXPECTED_COLUMNS = [
  "First Name",
  "Last Name",
  "Name",
  "Builder Name",
  "Classification",
  "Email",
  "Phone",
  "Title",
  "Geography",
] as const;

type ParsedRow = {
  rowIndex: number;
  firstName: string;
  lastName: string;
  builderNameInput: string;
  // Resolved at parse time:
  // - "match"    → known builder, builderId set
  // - "create"   → new builder will be created on commit
  // - "none"     → no builder name supplied
  builderResolution: "match" | "create" | "none";
  builderId: string | null;
  // Classification for the new builder (only used when builderResolution
  // is "create"). null = use the default ("private").
  newBuilderClassification: "private" | "public" | null;
  email: string;
  phone: string;
  title: string;
  geography: string;
  // Validation problems that block import for this row.
  errors: string[];
};

// Normalize header cell to a comparable key. Lowercase + strip non-alphanumeric.
function normalizeHeader(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_KEYS: Record<string, (typeof EXPECTED_COLUMNS)[number]> = {
  firstname: "First Name",
  fname: "First Name",
  lastname: "Last Name",
  lname: "Last Name",
  name: "Name",
  fullname: "Name",
  contactname: "Name",
  contact: "Name",
  buildername: "Builder Name",
  builder: "Builder Name",
  company: "Builder Name",
  companyname: "Builder Name",
  classification: "Classification",
  type: "Classification",
  buildertype: "Classification",
  companytype: "Classification",
  email: "Email",
  emailaddress: "Email",
  phone: "Phone",
  phonenumber: "Phone",
  mobile: "Phone",
  mobilephone: "Phone",
  cell: "Phone",
  cellphone: "Phone",
  workphone: "Phone",
  title: "Title",
  jobtitle: "Title",
  geography: "Geography",
  geo: "Geography",
  market: "Geography",
};

// Splits a single name string into first/last on the last whitespace boundary.
// "Mary Jane Smith" → first="Mary Jane", last="Smith"
// "Madonna"         → first="Madonna",   last=""
function splitFullName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const idx = trimmed.lastIndexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1),
  };
}

// Coerce a free-text classification cell to our enum. Lenient — accepts the
// canonical "public" / "private" plus common short forms. Returns null for
// blank or unrecognized values; the import treats null as "use the default."
function parseClassification(raw: string): "private" | "public" | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === "public" || v === "pub" || v === "publicly traded") return "public";
  if (v === "private" || v === "priv" || v === "privately held") return "private";
  return null;
}

export function ImportModal({ open, onOpenChange, builders }: ImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [forwardFill, setForwardFill] = useState(false);
  const [forwardFillSuggested, setForwardFillSuggested] = useState(false);
  const [hasBuilderColumn, setHasBuilderColumn] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet("");
    setForwardFill(false);
    setForwardFillSuggested(false);
    setHasBuilderColumn(false);
    setParsed(null);
    setParseError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClose(next: boolean) {
    if (isPending) return;
    if (!next) {
      // Defer reset so the close animation looks clean.
      setTimeout(reset, 150);
    }
    onOpenChange(next);
  }

  // Pure parse: reads the chosen sheet, finds a header row anywhere in the
  // first ~10 rows (Lyons-style files have a stale-formula title cell on
  // row 1 with the real headers on row 2), maps unknown→canonical, and
  // optionally forward-fills the Builder column for group-style layouts
  // (one builder name followed by N contacts with the column blank).
  // useForwardFill: "auto" → use the detected suggestion (and update the
  // toggle to match); boolean → use explicitly, leave toggle alone.
  function parseSheet(
    wb: XLSX.WorkBook,
    sheetName: string,
    useForwardFill: boolean | "auto",
  ) {
    setParseError(null);

    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      setParseError(`Sheet "${sheetName}" not found.`);
      return;
    }

    // 2D array form so we can scan multiple rows for a plausible header row
    // before committing to one. blankrows: true keeps positions stable so
    // the rowIndex shown in the preview matches the actual Excel row number.
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });

    if (aoa.length === 0) {
      setParseError("Sheet is empty.");
      setParsed([]);
      return;
    }

    // Find the row with the most cells that look like known headers. Tie-
    // breaks toward the earlier row. Require >= 2 matches so a stray "Email"
    // or "Phone" elsewhere in the file doesn't get picked.
    let headerRowIdx = -1;
    let bestScore = 0;
    const scanLimit = Math.min(10, aoa.length);
    for (let i = 0; i < scanLimit; i++) {
      const row = (aoa[i] ?? []) as unknown[];
      let score = 0;
      for (const cell of row) {
        if (HEADER_KEYS[normalizeHeader(cell)]) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        headerRowIdx = i;
      }
    }
    if (bestScore < 2 || headerRowIdx === -1) {
      setParseError(
        "Could not find a recognizable header row. Expected columns include First Name, Last Name, Email, Builder Name, etc.",
      );
      setParsed([]);
      return;
    }

    const headerRow = (aoa[headerRowIdx] ?? []) as unknown[];
    const colByCanonical: Partial<Record<(typeof EXPECTED_COLUMNS)[number], number>> = {};
    for (let c = 0; c < headerRow.length; c++) {
      const canonical = HEADER_KEYS[normalizeHeader(headerRow[c])];
      // First occurrence wins — duplicate aliases (e.g. both "Phone" and
      // "Mobile Phone") collapse onto the first column they appear in.
      if (canonical && colByCanonical[canonical] === undefined) {
        colByCanonical[canonical] = c;
      }
    }

    const builderColIdx = colByCanonical["Builder Name"] ?? -1;
    setHasBuilderColumn(builderColIdx >= 0);

    // Auto-detect group-style layout: count rows where Builder is empty but
    // the most recent prior row had a value. >=2 such "orphans" → suggest.
    let suggestForwardFill = false;
    if (builderColIdx >= 0) {
      let lastNonEmpty = "";
      let orphans = 0;
      for (let i = headerRowIdx + 1; i < aoa.length; i++) {
        const row = (aoa[i] ?? []) as unknown[];
        const v = String(row[builderColIdx] ?? "").trim();
        if (!v && lastNonEmpty) orphans++;
        if (v) lastNonEmpty = v;
      }
      suggestForwardFill = orphans >= 2;
    }
    setForwardFillSuggested(suggestForwardFill);

    const effectiveForwardFill =
      useForwardFill === "auto" ? suggestForwardFill : useForwardFill;
    if (useForwardFill === "auto") setForwardFill(suggestForwardFill);

    // Pre-compute the (possibly forward-filled) builder name per row so the
    // main row map can stay simple.
    const builderNamePerRow: string[] = [];
    let lastBuilder = "";
    for (let i = headerRowIdx + 1; i < aoa.length; i++) {
      const row = (aoa[i] ?? []) as unknown[];
      let v = builderColIdx >= 0 ? String(row[builderColIdx] ?? "").trim() : "";
      if (!v && effectiveForwardFill) v = lastBuilder;
      if (v) lastBuilder = v;
      builderNamePerRow.push(v);
    }

    const builderByLowerName = new Map(
      builders.map((b) => [b.name.toLowerCase(), b]),
    );

    const dataRows = aoa.slice(headerRowIdx + 1) as unknown[][];
    const rows: ParsedRow[] = dataRows.map((row, i) => {
      const cell = (canonical: (typeof EXPECTED_COLUMNS)[number]): string => {
        const idx = colByCanonical[canonical];
        if (idx === undefined) return "";
        return String(row[idx] ?? "").trim();
      };

      let firstName = cell("First Name");
      let lastName = cell("Last Name");
      const fullName = cell("Name");
      if (!firstName && !lastName && fullName) {
        const split = splitFullName(fullName);
        firstName = split.firstName;
        lastName = split.lastName;
      }
      const builderNameInput = builderNamePerRow[i] ?? "";
      const classificationRaw = cell("Classification");
      const newBuilderClassification = parseClassification(classificationRaw);
      const email = cell("Email");
      const phone = cell("Phone");
      const title = cell("Title");
      const geography = cell("Geography");

      const errors: string[] = [];
      if (!firstName) errors.push("Missing first name");
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errors.push("Invalid email");
      }

      let builderResolution: ParsedRow["builderResolution"] = "none";
      let builderId: string | null = null;
      if (builderNameInput) {
        const match = builderByLowerName.get(builderNameInput.toLowerCase());
        if (match) {
          builderResolution = "match";
          builderId = match.id;
        } else {
          builderResolution = "create";
        }
      }

      return {
        rowIndex: headerRowIdx + i + 2, // +1 for 1-indexing, +1 to skip header
        firstName,
        lastName,
        builderNameInput,
        builderResolution,
        builderId,
        newBuilderClassification,
        email,
        phone,
        title,
        geography,
        errors,
      };
    });

    // Drop rows with no name and no email — these are blank separator rows
    // in the file (especially common in group-style layouts where forward-
    // fill carries over the builder name onto an otherwise empty row).
    // A builder-only row can't become a contact, so it isn't worth showing.
    const nonEmpty = rows.filter(
      (r) => r.firstName || r.lastName || r.email,
    );

    if (nonEmpty.length === 0) {
      setParseError("Sheet has a header row but no data rows.");
      setParsed([]);
      return;
    }

    setParsed(nonEmpty);
  }

  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (wb.SheetNames.length === 0) {
        setParseError("File has no sheets.");
        return;
      }
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      const first = wb.SheetNames[0];
      setSelectedSheet(first);
      parseSheet(wb, first, "auto");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not parse file.");
    }
  }

  function handleSheetChange(name: string) {
    if (!workbook) return;
    setSelectedSheet(name);
    parseSheet(workbook, name, "auto");
  }

  function handleForwardFillToggle(checked: boolean) {
    if (!workbook || !selectedSheet) return;
    setForwardFill(checked);
    parseSheet(workbook, selectedSheet, checked);
  }

  function handleCommit() {
    if (!parsed) return;
    const rows: ImportContactRow[] = parsed
      .filter((r) => r.errors.length === 0)
      .map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        title: r.title || null,
        email: r.email || null,
        phone: r.phone || null,
        geography: r.geography || null,
        builderId: r.builderId,
        newBuilderName: r.builderResolution === "create" ? r.builderNameInput : null,
        newBuilderClassification:
          r.builderResolution === "create" ? r.newBuilderClassification : null,
      }));

    startTransition(async () => {
      try {
        const res = await importContacts(rows);
        setResult(res);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Import failed.");
      }
    });
  }

  // Aggregate stats for the preview header.
  const validRows = parsed?.filter((r) => r.errors.length === 0).length ?? 0;
  const errorRows = parsed?.filter((r) => r.errors.length > 0).length ?? 0;
  const newBuilders = parsed
    ? new Set(
        parsed
          .filter((r) => r.builderResolution === "create" && r.errors.length === 0)
          .map((r) => r.builderNameInput.toLowerCase()),
      ).size
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Contacts from Excel</DialogTitle>
          <DialogDescription>
            Upload an .xlsx or .csv file. Expected columns:{" "}
            <span className="font-medium">{EXPECTED_COLUMNS.join(", ")}</span>. Header row required;
            other column orders are fine.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-6 text-center">
              <Check className="h-8 w-8 text-green-600" />
              <p className="text-sm font-semibold text-gray-900">Import complete</p>
              <ul className="text-[13px] text-gray-700">
                <li>{result.contactsCreated} contact(s) created</li>
                <li>{result.contactsUpdated} contact(s) updated (matched by email)</li>
                <li>{result.buildersCreated} new builder(s) created</li>
                {result.skipped > 0 && (
                  <li className="text-amber-700">{result.skipped} row(s) skipped</li>
                )}
              </ul>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : !parsed ? (
          <div className="space-y-4 py-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-10 text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Upload className="h-8 w-8" />
              <p className="text-sm font-semibold">Click to choose a file</p>
              <p className="text-xs text-gray-400">.xlsx or .csv, up to 10 MB</p>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {parseError && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[13px]">
              <span className="flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-gray-500" />
                <span className="font-semibold text-gray-700">{parsed.length}</span> rows parsed
              </span>
              <span className="text-green-700">{validRows} ready</span>
              {errorRows > 0 && <span className="text-red-700">{errorRows} with errors</span>}
              {newBuilders > 0 && (
                <span className="text-amber-700">{newBuilders} new builder(s) will be created</span>
              )}
              <button
                type="button"
                onClick={reset}
                className="ml-auto text-xs text-gray-500 hover:text-gray-700"
              >
                Choose a different file
              </button>
            </div>

            {sheetNames.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="text-gray-500">Sheet:</span>
                {sheetNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSheetChange(name)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 font-medium transition-colors",
                      name === selectedSheet
                        ? "border-gray-700 bg-gray-700 text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            {hasBuilderColumn && (
              <label className="flex items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-700">
                <input
                  type="checkbox"
                  checked={forwardFill}
                  onChange={(e) => handleForwardFillToggle(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Forward-fill empty Builder cells from the row above
                  {forwardFillSuggested && (
                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      suggested
                    </span>
                  )}
                  <span className="block text-[11px] text-gray-500">
                    Use this when the file groups multiple contacts under one
                    builder name (only the first row in each group has the
                    company filled in).
                  </span>
                </span>
              </label>
            )}

            <div className="max-h-[400px] overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-gray-50 text-[10px] font-semibold tracking-wider text-gray-600 uppercase">
                  <tr>
                    <th className="px-2 py-2 text-left">Row</th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">Builder</th>
                    <th className="px-2 py-2 text-left">Email</th>
                    <th className="px-2 py-2 text-left">Title</th>
                    <th className="px-2 py-2 text-left">Geo</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r) => (
                    <tr
                      key={r.rowIndex}
                      className={cn(
                        "border-t border-gray-100",
                        r.errors.length > 0 && "bg-red-50/50",
                      )}
                    >
                      <td className="px-2 py-1.5 text-gray-400 tabular-nums">{r.rowIndex}</td>
                      <td className="px-2 py-1.5 text-gray-800">
                        {r.firstName} {r.lastName}
                        {r.errors.length > 0 && (
                          <div className="text-[10px] font-medium text-red-700">
                            {r.errors.join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">
                        {r.builderResolution === "match" && r.builderNameInput}
                        {r.builderResolution === "create" && (
                          <span className="text-amber-700">
                            + create {r.builderNameInput}
                            <span className="ml-1 text-[10px] text-amber-600">
                              ({r.newBuilderClassification ?? "private"})
                            </span>
                          </span>
                        )}
                        {r.builderResolution === "none" && (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">
                        {r.email || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">
                        {r.title || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">
                        {r.geography || <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={isPending}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button onClick={handleCommit} disabled={isPending || validRows === 0}>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Import {validRows} contact(s)
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
