"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Trash2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AuditEntryRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

type AuditListProps = {
  entries: AuditEntryRow[];
  // True when more entries exist than the server's default cap returned.
  truncated: boolean;
  limit: number;
};

// Human labels for the actions written so far. Deliberately a lookup with a
// fallback rather than an exhaustive union: audit coverage lands in batches,
// and an action added by a later batch must render sensibly here before
// anyone remembers to update this map. `prettifyAction` turns
// "issue.status_changed" into "Issue status changed", which is good enough
// to read while the batch is in flight.
const ACTION_LABEL: Record<string, string> = {
  "member.invited": "Member invited",
  "member.removed": "Member removed",
  "member.role_changed": "Member role changed",
  "member.disabled": "Member disabled",
  "member.re_enabled": "Member re-enabled",
  "member.password_reset": "Member password reset",
  "checklist_item.completed": "Checklist item checked off",
  "checklist_item.uncompleted": "Checklist item un-checked",
  "checklist_item.date_set": "Milestone date set",
  "checklist_item.date_cleared": "Milestone date cleared",
  "checklist_item.notes_updated": "Checklist note updated",
  "checklist_item.notes_cleared": "Checklist note cleared",
  "checklist_item_link.added": "Checklist link added",
  "checklist_item_link.updated": "Checklist link updated",
  "checklist_item_link.deleted": "Checklist link deleted",

  "deal.created": "Deal created",
  "deal.updated": "Deal updated",
  "deal.archived": "Deal archived",
  "deal.unarchived": "Deal unarchived",
  "deal.deleted": "Deal deleted",
  "deal.banner_set": "Deal banner set",
  "deal.banner_cleared": "Deal banner cleared",
  "deal.psa_drafting_set": "PSA drafting side set",
  "deal.psa_drafting_cleared": "PSA drafting side cleared",

  // Buyer tracking. "Confi" and "OM" are the app's own words for the
  // confidentiality agreement and the offering memorandum; do not spell them out
  // here, the Contacts tab labels them this way.
  "deal_buyer.added": "Builder added to deal",
  "deal_buyer.attached": "Builder attached to deal",
  "deal_buyer.tier_changed": "Buyer tier changed",
  "deal_buyer.lead_assigned": "Buyer lead assigned",
  "deal_buyer.lead_cleared": "Buyer lead cleared",
  "deal_buyer.called_set": "Buyer marked called",
  "deal_buyer.called_cleared": "Buyer called cleared",
  "deal_buyer.om_sent_set": "OM marked sent",
  "deal_buyer.om_sent_cleared": "OM sent cleared",
  "deal_buyer.dd_sent_set": "DD marked sent",
  "deal_buyer.dd_sent_cleared": "DD sent cleared",
  "deal_buyer.confi_signed_set": "Confi marked signed",
  "deal_buyer.confi_signed_cleared": "Confi signed cleared",
  "deal_buyer.offer_received_set": "Offer marked received",
  "deal_buyer.offer_received_cleared": "Offer received cleared",
  "deal_buyer.comments_updated": "Buyer comments updated",
  "deal_buyer.comments_cleared": "Buyer comments cleared",
  "deal_buyer.cc_users_updated": "Buyer CC list updated",
  "deal_buyer.bulk_sent_marked": "Builders marked sent in bulk",

  "builder.created": "Builder created",
  "builder.updated": "Builder updated",
  "builder.deleted": "Builder deleted",

  "contact.created": "Contact created",
  "contact.updated": "Contact updated",
  "contact.deleted": "Contact deleted",
  "contact.bulk_imported": "Contacts imported from Excel",
  "contact.communication_enabled": "Contact opted in to email",
  "contact.communication_disabled": "Contact opted out of email",
  "deal_contact.bulk_added": "Contacts added to deal in bulk",
  "deal_contact.removed": "Contact removed from deal",

  "qa_item.created": "Q&A item created",
  "qa_item.updated": "Q&A item updated",
  "qa_item.approved": "Q&A item approved",
  "qa_item.unapproved": "Q&A item unapproved",
  "qa_item.bulk_approved": "All Q&A items approved",
  "qa_item.deleted": "Q&A item deleted",

  "issue.created": "Issue created",
  "issue.updated": "Issue updated",
  "issue.status_changed": "Issue status changed",
  "issue.deleted": "Issue deleted",

  "consultant.created": "Consultant added",
  "consultant.updated": "Consultant updated",
  "consultant.deleted": "Consultant deleted",

  "deal_team_member.added": "Deal team member added",
  "deal_team_member.bulk_added": "Deal team members added in bulk",
  "deal_team_member.updated": "Deal team member updated",
  "deal_team_member.removed": "Deal team member removed",
  "deal_team_member.emails_included": "Deal team member included in emails",
  "deal_team_member.emails_excluded": "Deal team member excluded from emails",

  "document.uploaded": "Document uploaded",
  "document.deleted": "Document deleted",

  // Client-facing mail. These are the entries that say the firm sent something
  // to a homebuilder, so the outcome variants stay distinct in the filter.
  "email_blast.sent": "Email blast sent",
  "email_blast.partially_sent": "Email blast partially sent",
  "email_blast.send_failed": "Email blast failed",
  "email_blast.send_aborted": "Email blast aborted",
  "feedback_summary.sent": "Feedback summary sent",

  "profile.updated": "Profile updated",
  "profile.password_changed": "Password changed by user",

  "feedback.status_changed": "Feedback status changed",
  "feedback.deleted": "Feedback deleted",
  "feedback_comment.edited": "Feedback comment edited",
  "feedback_comment.deleted": "Feedback comment deleted",
  "feedback_attachment.deleted": "Feedback attachment deleted",
};

// Entity types get a stable colour so the eye can group a long list by the kind
// of thing that changed. Anything unmapped falls back to grey and still reads
// fine, so a table added later needs no change here.
const ENTITY_CHIP: Record<string, string> = {
  user: "bg-purple-100 text-purple-800",
  deal: "bg-slate-200 text-slate-800",
  checklist_item: "bg-blue-100 text-blue-800",
  checklist_item_link: "bg-blue-50 text-blue-700",
  deal_buyer: "bg-emerald-100 text-emerald-800",
  builder: "bg-emerald-50 text-emerald-700",
  contact: "bg-teal-100 text-teal-800",
  deal_contact: "bg-teal-50 text-teal-700",
  qa_item: "bg-indigo-100 text-indigo-800",
  issue: "bg-orange-100 text-orange-800",
  consultant: "bg-amber-100 text-amber-800",
  deal_team_member: "bg-cyan-100 text-cyan-800",
  document: "bg-violet-100 text-violet-800",
  email_blast: "bg-rose-100 text-rose-800",
  feedback_item: "bg-pink-100 text-pink-800",
  feedback_comment: "bg-pink-50 text-pink-700",
  feedback_attachment: "bg-pink-50 text-pink-700",
};

// Table name to the words the rest of the app uses. Kept separate from
// FIELD_LABEL because the two namespaces genuinely differ: "contact" is a table
// here and could be a column elsewhere.
const ENTITY_LABEL: Record<string, string> = {
  user: "Member",
  deal: "Deal",
  checklist_item: "Checklist item",
  checklist_item_link: "Checklist link",
  deal_buyer: "Buyer on deal",
  builder: "Builder",
  contact: "Contact",
  deal_contact: "Contact on deal",
  qa_item: "Q&A item",
  issue: "Issue",
  consultant: "Consultant",
  deal_team_member: "Deal team member",
  document: "Document",
  email_blast: "Email send",
  feedback_item: "Feedback",
  feedback_comment: "Feedback comment",
  feedback_attachment: "Feedback attachment",
};

// Column names as they appear in before/after snapshots, mapped to the words
// the rest of the app already uses for them. `trackedDate` in particular is a
// legacy column name that the checklist UI has always rendered as "Actual".
const FIELD_LABEL: Record<string, string> = {
  trackedDate: "Actual date",
  estimatedDate: "Est. date",
  notes: "Note",
  completed: "Checked off",
  completedAt: "Checked off at",
  disabledAt: "Disabled at",
  role: "Role",
  email: "Email",
  name: "Name",
};

function prettifyAction(action: string): string {
  const cleaned = action.replace(/[._]/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? prettifyAction(action);
}

// Human name for an entity type. Falls back to the same prettifier as actions,
// so a table added by a later batch reads correctly with no change here.
function entityLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? prettifyAction(entityType);
}

// Deletions are the entries that matter most: for a destroyed row the audit
// entry is the only surviving record of what was there. They get called out in
// the list and get their own filter, so "what did anyone delete" is one click
// rather than a scan. Derived from the verb half of the action string, which
// the naming convention in src/lib/audit.ts guarantees is present.
function isDestructive(action: string): boolean {
  const verb = action.slice(action.indexOf(".") + 1);
  return (
    verb === "deleted" ||
    verb === "removed" ||
    verb.endsWith("_deleted") ||
    verb.endsWith("_removed")
  );
}

// The row-level description. Richer than `actionLabel` because it can read
// action-specific metadata: a date change says which of the two dates moved,
// which is the whole question the log exists to answer for milestones.
function describeAction(entry: AuditEntryRow): string {
  const kind = readString(entry.metadata, "dateKind");
  switch (entry.action) {
    case "checklist_item.date_set":
      return kind === "estimate" ? "Set Est. date" : "Set Actual date";
    case "checklist_item.date_cleared":
      return kind === "estimate" ? "Cleared Est. date" : "Cleared Actual date";
    default:
      return actionLabel(entry.action);
  }
}

function fieldLabel(key: string): string {
  if (FIELD_LABEL[key]) return FIELD_LABEL[key];
  const spaced = key
    .replace(/([A-Z])/g, " $1")
    .replace(/[._]/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function readString(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function actorLabel(entry: AuditEntryRow): string {
  if (entry.actorName) return entry.actorName;
  if (entry.actorEmail) return entry.actorEmail;
  // user_id is `onDelete: set null`, so entries written by a member who was
  // later removed survive with no actor. Distinguish that case from an entry
  // that was genuinely system-authored.
  return entry.actorId === null ? "System" : "Removed user";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() === "" ? "(empty)" : value;
  return JSON.stringify(value);
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Metadata keys the viewer renders in its own columns. Everything else is
// action-specific and gets listed in the expanded detail panel.
const RESERVED_METADATA_KEYS = new Set(["dealId", "dealName", "label"]);

export function AuditList({ entries, truncated, limit }: AuditListProps) {
  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dealFilter, setDealFilter] = useState<string>("all");
  const [destructiveOnly, setDestructiveOnly] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Picking an entity narrows the Action list to that entity's verbs. If the
  // action currently selected does not belong to the new entity it would filter
  // everything to nothing, so drop it back to "all" rather than showing an
  // empty table the user has to debug.
  function selectEntity(next: string) {
    setEntityFilter(next);
    if (next !== "all" && actionFilter !== "all" && !actionFilter.startsWith(`${next}.`)) {
      setActionFilter("all");
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Filter options are derived from the entries actually present rather than
  // hardcoded, so a batch that introduces new actions needs no change here.
  const actors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      const key = e.actorId ?? "__system__";
      if (!seen.has(key)) seen.set(key, actorLabel(e));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const entityTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries) seen.add(e.entityType);
    return [...seen].sort((a, b) => entityLabel(a).localeCompare(entityLabel(b)));
  }, [entries]);

  // Scoped to the selected entity. With coverage across the whole mutation
  // surface this list runs to dozens of verbs, and an unscoped dropdown of that
  // length is not usable.
  const actions = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries) {
      if (entityFilter !== "all" && e.entityType !== entityFilter) continue;
      seen.add(e.action);
    }
    return [...seen].sort((a, b) => actionLabel(a).localeCompare(actionLabel(b)));
  }, [entries, entityFilter]);

  const dealOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      const dealId = readString(e.metadata, "dealId");
      if (!dealId) continue;
      if (!seen.has(dealId)) {
        seen.set(dealId, readString(e.metadata, "dealName") ?? "Untitled deal");
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = entries.filter((e) => {
      if (entityFilter !== "all" && e.entityType !== entityFilter) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (actorFilter !== "all" && (e.actorId ?? "__system__") !== actorFilter) return false;
      if (dealFilter !== "all" && readString(e.metadata, "dealId") !== dealFilter) return false;
      if (destructiveOnly && !isDestructive(e.action)) return false;
      if (!q) return true;
      const haystack = [
        actorLabel(e),
        e.actorEmail ?? "",
        describeAction(e),
        e.action,
        e.entityType,
        e.entityId ?? "",
        readString(e.metadata, "label") ?? "",
        readString(e.metadata, "dealName") ?? "",
        JSON.stringify(e.before ?? {}),
        JSON.stringify(e.after ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [entries, search, actorFilter, entityFilter, actionFilter, dealFilter, destructiveOnly, sortDir]);

  const filtersActive =
    actorFilter !== "all" ||
    entityFilter !== "all" ||
    actionFilter !== "all" ||
    dealFilter !== "all" ||
    destructiveOnly ||
    search.trim() !== "";

  const destructiveCount = useMemo(
    () => entries.filter((e) => isDestructive(e.action)).length,
    [entries],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterMenu
          label="Type"
          current={entityFilter}
          options={[
            { value: "all", label: "Everything" },
            ...entityTypes.map((t) => ({ value: t, label: entityLabel(t) })),
          ]}
          onSelect={selectEntity}
        />
        <FilterMenu
          label="Action"
          current={actionFilter}
          options={[
            { value: "all", label: "All actions" },
            ...actions.map((a) => ({ value: a, label: actionLabel(a) })),
          ]}
          onSelect={setActionFilter}
        />
        <FilterMenu
          label="Who"
          current={actorFilter}
          options={[
            { value: "all", label: "Anyone" },
            ...actors.map(([value, label]) => ({ value, label })),
          ]}
          onSelect={setActorFilter}
        />
        {dealOptions.length > 0 && (
          <FilterMenu
            label="Deal"
            current={dealFilter}
            options={[
              { value: "all", label: "All deals" },
              ...dealOptions.map(([value, label]) => ({ value, label })),
            ]}
            onSelect={setDealFilter}
          />
        )}
        {destructiveCount > 0 && (
          <button
            type="button"
            onClick={() => setDestructiveOnly(!destructiveOnly)}
            title="Show only entries where something was deleted or removed"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold",
              destructiveOnly
                ? "border-red-600 bg-red-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:border-gray-400",
            )}
          >
            <Trash2 className="h-3 w-3" />
            Deletions
            <span className="text-[10px] tabular-nums opacity-70">({destructiveCount})</span>
          </button>
        )}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entries..."
          className="h-8 w-56 text-[13px]"
        />
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setActorFilter("all");
              setEntityFilter("all");
              setActionFilter("all");
              setDealFilter("all");
              setDestructiveOnly(false);
            }}
            className="text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500 tabular-nums">
          {visible.length} of {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {truncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
          Showing the {limit} most recent entries. Filters and search apply only to these.{" "}
          <Link href="/admin/audit?all=1" className="font-semibold underline">
            Load the full history
          </Link>{" "}
          to search further back.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold tracking-wider text-gray-600 uppercase">
              <th className="w-8 px-2 py-2.5"></th>
              <th className="px-4 py-2.5 text-left">
                <button
                  type="button"
                  onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                  className="inline-flex items-center gap-1 uppercase hover:text-gray-900"
                >
                  When
                  {sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                </button>
              </th>
              <th className="px-4 py-2.5 text-left">Who</th>
              <th className="px-4 py-2.5 text-left">What</th>
              <th className="px-4 py-2.5 text-left">Where</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-gray-500">
                  {entries.length === 0
                    ? "No audit entries yet. Entries appear here as people change deals and members."
                    : "No entries match these filters."}
                </td>
              </tr>
            )}
            {visible.map((entry) => {
              const isOpen = expanded.has(entry.id);
              const dealId = readString(entry.metadata, "dealId");
              const dealName = readString(entry.metadata, "dealName");
              const label = readString(entry.metadata, "label");
              return (
                <Fragment key={entry.id}>
                  <tr
                    onClick={() => toggleExpanded(entry.id)}
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-2 py-3 text-gray-400">
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap text-gray-600"
                      title={formatTimestamp(entry.createdAt)}
                    >
                      {relTime(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900">{actorLabel(entry)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          isDestructive(entry.action)
                            ? "font-semibold text-red-700"
                            : "text-gray-800",
                        )}
                      >
                        {describeAction(entry)}
                      </span>
                      <span
                        className={cn(
                          "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          ENTITY_CHIP[entry.entityType] ?? "bg-gray-100 text-gray-700",
                        )}
                      >
                        {entityLabel(entry.entityType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {label && <span className="font-medium text-gray-900">{label}</span>}
                      {label && dealName && <span className="text-gray-400"> &middot; </span>}
                      {dealName &&
                        (dealId ? (
                          <Link
                            href={`/deals/${dealId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 hover:text-gray-900 hover:underline"
                          >
                            {dealName}
                            <ExternalLink className="h-3 w-3 opacity-50" />
                          </Link>
                        ) : (
                          dealName
                        ))}
                      {!label && !dealName && <span className="text-gray-400">&mdash;</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <td></td>
                      <td colSpan={4} className="px-4 py-3">
                        <EntryDetail entry={entry} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntryDetail({ entry }: { entry: AuditEntryRow }) {
  const keys = [
    ...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})]),
  ];
  const extras = Object.entries(entry.metadata ?? {}).filter(
    ([key]) => !RESERVED_METADATA_KEYS.has(key),
  );

  return (
    <div className="space-y-3">
      {keys.length > 0 ? (
        <table className="border-collapse text-[12px]">
          <thead>
            <tr className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
              <th className="py-1 pr-6 text-left">Field</th>
              <th className="py-1 pr-6 text-left">Before</th>
              <th className="py-1 text-left">After</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const before = entry.before?.[key];
              const after = entry.after?.[key];
              const changed = JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
              return (
                <tr key={key} className="align-top">
                  <td className="py-1 pr-6 font-medium text-gray-700">{fieldLabel(key)}</td>
                  <td className="max-w-md py-1 pr-6 break-words text-gray-500">
                    {formatValue(before)}
                  </td>
                  <td
                    className={cn(
                      "max-w-md py-1 break-words",
                      changed ? "font-semibold text-gray-900" : "text-gray-500",
                    )}
                  >
                    {formatValue(after)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="text-[12px] text-gray-500">
          This action records no before and after values.
        </div>
      )}

      {extras.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-gray-500">
          {extras.map(([key, value]) => (
            <span key={key}>
              <span className="font-medium text-gray-700">{fieldLabel(key)}:</span>{" "}
              {formatValue(value)}
            </span>
          ))}
        </div>
      )}

      <div className="text-[11px] text-gray-400">
        {formatTimestamp(entry.createdAt)} &middot; {entry.action}
        {entry.entityId ? ` · ${entry.entityId}` : ""}
      </div>
    </div>
  );
}

function FilterMenu({
  label,
  current,
  options,
  onSelect,
}: {
  label: string;
  current: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}) {
  const active = options.find((o) => o.value === current);
  const isDefault = current === "all";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold",
          isDefault
            ? "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
            : "border-brand-ink bg-brand-ink text-white",
        )}
      >
        <span className="opacity-60">{label}:</span>
        {active?.label ?? "All"}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={cn("text-[13px]", option.value === current && "font-semibold")}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
