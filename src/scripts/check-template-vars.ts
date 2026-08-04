// Build-time guard against unpopulated email-template placeholders.
//
// Why this exists: on 2026-05-13 the Share-DD-Material send shipped with
// a {{ddFolderUrl}} placeholder and a code comment saying the value
// would be injected "at real send time" — true then, because sends were
// still mocked. The 2026-05-20 Resend cutover made that assumption false
// and nothing pointed back at the template. The row emailed a literal
// "{{ddFolderUrl}}" for 78 days. Typecheck couldn't catch it (the
// extraVars prop is optional) and interpolate() deliberately passes
// unmatched vars through rather than throwing, so there was no runtime
// error either.
//
// Design notes, both learned from an adversarial review of the first
// version of this script:
//
//   1. We IMPORT the templates module rather than regex-scraping it.
//      Scraping silently under-covers: converting one template to the
//      `satisfies EmailTemplate` idiom made the old version report
//      "OK (17 templates)" and exit 0, and a body containing "};" at
//      column 0 truncated the captured text so trailing placeholders
//      went unchecked. Importing is syntax-agnostic and reads the real
//      runtime string, so extracted shared fragments are inlined too.
//
//   2. CALLER_SUPPLIED is cross-checked against actual call-site wiring
//      instead of being a bare promise. A var may only be declared
//      caller-supplied if something under VIEWS_DIR actually lists it in
//      a requireVars={[...]} array or an extraVars={{...}} object.
//      Otherwise deleting the wiring would leave the guard green while
//      the placeholder went unpopulated again — the original bug.
//
// Run: npm run check:template-vars   (first step of vercel-build)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Resolve from this file, not process.cwd(), so the script behaves the
// same when invoked from a subdirectory.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATES_MODULE = join(ROOT, "src/lib/email-templates.ts");
const VIEWS_DIR = join(ROOT, "src/app/(app)/deals/[id]/views");

// Vars the composer supplies unconditionally and non-empty: the deal
// identity bundle plus the sender name resolved from the picked sender.
//
// NOTE: dueDate and bnfDueDate are deliberately NOT here. They come from
// formatOfferingDate(), which returns "" when the milestone is unset —
// and interpolate() treats "" as missing and re-emits the literal
// placeholder. They're only safe because their call sites gate on
// requireOfferingDate / requireBnfDate, which makes them caller-supplied
// in the sense that matters here.
const ALWAYS_SUPPLIED = new Set(["dealName", "city", "units", "type", "senderName"]);

// Vars a call site must resolve and inject. Every entry here is verified
// below against real wiring under VIEWS_DIR.
const CALLER_SUPPLIED = new Set([
  "ddFolderUrl",
  "draftingNote",
  "offersDueDate",
  "reviewDate",
  "dueDate",
  "bnfDueDate",
]);

// dueDate/bnfDueDate are wired via requireOfferingDate / requireBnfDate
// boolean props rather than a requireVars entry, so the generic wiring
// scan can't see them. Map them to the prop that gates each.
const GATED_BY_BOOLEAN_PROP: Record<string, string> = {
  dueDate: "requireOfferingDate",
  bnfDueDate: "requireBnfDate",
};

type Template = { subject: string; body: string };

function isTemplate(v: unknown): v is Template {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Template).subject === "string" &&
    typeof (v as Template).body === "string"
  );
}

function readTsxFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...readTsxFilesRecursive(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

async function main() {
  // --- Load templates by importing, not scraping. -----------------
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(TEMPLATES_MODULE).href)) as Record<
      string,
      unknown
    >;
  } catch (err) {
    console.error(
      `check:template-vars — could not import ${TEMPLATES_MODULE}\n` +
        `Check the script's path resolution.\n`,
      err,
    );
    process.exit(1);
  }

  const templates = Object.entries(mod).filter(([, v]) => isTemplate(v)) as [
    string,
    Template,
  ][];

  if (templates.length === 0) {
    console.error(
      "check:template-vars — found 0 templates. The module shape likely changed; fix this script rather than ignoring it.",
    );
    process.exit(1);
  }

  // --- Scan call sites for real wiring. ---------------------------
  const viewsSrc = readTsxFilesRecursive(VIEWS_DIR)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  const wiredVars = new Set<string>();
  // requireVars={["a", "b"]}
  for (const m of viewsSrc.matchAll(/requireVars=\{\[([^\]]*)\]\}/g)) {
    for (const s of m[1].matchAll(/["']([A-Za-z0-9_]+)["']/g)) wiredVars.add(s[1]);
  }
  // extraVars={{ a: ..., b: ... }}
  for (const m of viewsSrc.matchAll(/extraVars=\{\{([\s\S]*?)\}\}/g)) {
    for (const s of m[1].matchAll(/([A-Za-z0-9_]+)\s*:/g)) wiredVars.add(s[1]);
  }
  // runPreflight({ required: ["a", "b"] }) — the imperative form. Some
  // composers resolve vars in their own click handler instead of taking
  // a requireVars prop, and without this the reverse check below would
  // call a correctly-wired var unwired.
  for (const m of viewsSrc.matchAll(/required:\s*\[([^\]]*)\]/g)) {
    for (const s2 of m[1].matchAll(/["']([A-Za-z0-9_]+)["']/g)) wiredVars.add(s2[1]);
  }
  // setVars({ ...ctx.vars, a: ..., b: ... }) — a var injected directly
  // into the composer's var bag rather than through a prop.
  for (const m of viewsSrc.matchAll(/setVars\(\{([\s\S]*?)\}\)/g)) {
    for (const s2 of m[1].matchAll(/([A-Za-z0-9_]+)\s*:/g)) wiredVars.add(s2[1]);
  }
  // Boolean-prop gates (requireOfferingDate, requireBnfDate).
  for (const [varName, prop] of Object.entries(GATED_BY_BOOLEAN_PROP)) {
    if (new RegExp(`\\b${prop}\\b`).test(viewsSrc)) wiredVars.add(varName);
  }

  const errors: string[] = [];

  // --- 1. Every placeholder must be accounted for. ----------------
  for (const [name, tpl] of templates) {
    const placeholders = new Set(
      [...`${tpl.subject}\n${tpl.body}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(
        (m) => m[1],
      ),
    );
    for (const p of placeholders) {
      if (!ALWAYS_SUPPLIED.has(p) && !CALLER_SUPPLIED.has(p)) {
        errors.push(
          `${name} -> {{${p}}} is not supplied by the deal context and is not registered as caller-supplied.`,
        );
      }
    }
  }

  // --- 2. Every caller-supplied var must actually be wired. -------
  // Closes the reverse gap: deleting a requireVars prop would otherwise
  // leave this script green while the placeholder went unpopulated.
  for (const v of CALLER_SUPPLIED) {
    if (!wiredVars.has(v)) {
      errors.push(
        `"${v}" is registered as caller-supplied but no requireVars / extraVars / gating prop under ` +
          `src/app/(app)/deals/[id]/views references it. Either wire it at the call site or remove it from CALLER_SUPPLIED.`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(
      `\ncheck:template-vars — ${errors.length} problem(s) across ${templates.length} templates:\n`,
    );
    for (const e of errors) console.error(`  ${e}`);
    console.error(
      `\nShipping an unresolved placeholder means the client receives a literal "{{var}}" in the email body.\n`,
    );
    process.exit(1);
  }

  console.log(
    `check:template-vars — OK (${templates.length} templates, ${CALLER_SUPPLIED.size} caller-supplied vars all wired)`,
  );
}

main().catch((err) => {
  console.error("check:template-vars — unexpected failure", err);
  process.exit(1);
});
