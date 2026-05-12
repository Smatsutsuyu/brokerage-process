import { redirect } from "next/navigation";
import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { ExternalLink, MessageSquare } from "lucide-react";

import { db } from "@/db";
import { feedbackComments, feedbackItems } from "@/db/schema";
import { Sidebar } from "@/components/layout/sidebar";
import { CommentThread, type CommentRow } from "@/components/feedback/comment-thread";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My feedback — Lakebridge Capital",
};

const SEVERITY_META: Record<
  "nit" | "suggestion" | "bug" | "blocker",
  { label: string; chip: string }
> = {
  blocker: { label: "Blocker", chip: "bg-red-100 text-red-800" },
  bug: { label: "Bug", chip: "bg-orange-100 text-orange-800" },
  suggestion: { label: "Suggestion", chip: "bg-blue-100 text-blue-800" },
  nit: { label: "Nit", chip: "bg-gray-100 text-gray-700" },
};

const STATUS_META: Record<
  "new" | "reviewed" | "actioned" | "complete" | "wontfix",
  { label: string; chip: string }
> = {
  new: { label: "New", chip: "bg-amber-100 text-amber-800" },
  reviewed: { label: "Reviewed", chip: "bg-blue-100 text-blue-800" },
  actioned: { label: "Actioned", chip: "bg-indigo-100 text-indigo-800" },
  complete: { label: "Complete", chip: "bg-green-100 text-green-800" },
  wontfix: { label: "Won't fix", chip: "bg-gray-100 text-gray-700" },
};

export default async function MyFeedbackPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");
  const org = await getCurrentOrg();
  if (!org) redirect("/sign-in");

  // Submitter view — only items this user filed. Owners get the broader
  // /admin/feedback view that shows everything in the org.
  const rows = await db
    .select({
      id: feedbackItems.id,
      section: feedbackItems.section,
      pagePath: feedbackItems.pagePath,
      severity: feedbackItems.severity,
      status: feedbackItems.status,
      comment: feedbackItems.comment,
      createdAt: feedbackItems.createdAt,
    })
    .from(feedbackItems)
    .where(eq(feedbackItems.userId, me.id))
    .orderBy(desc(feedbackItems.createdAt));

  const itemIds = rows.map((r) => r.id);
  const commentRows = itemIds.length
    ? await db
        .select({
          id: feedbackComments.id,
          feedbackId: feedbackComments.feedbackId,
          authorId: feedbackComments.userId,
          authorEmail: feedbackComments.userEmail,
          body: feedbackComments.body,
          createdAt: feedbackComments.createdAt,
          updatedAt: feedbackComments.updatedAt,
        })
        .from(feedbackComments)
        .where(inArray(feedbackComments.feedbackId, itemIds))
        .orderBy(asc(feedbackComments.createdAt))
    : [];

  const commentsByFeedback: Record<string, CommentRow[]> = {};
  for (const c of commentRows) {
    const list = (commentsByFeedback[c.feedbackId] ??= []);
    list.push({
      id: c.id,
      authorId: c.authorId,
      authorEmail: c.authorEmail,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    });
  }

  return (
    <>
      <Sidebar />
      <main className="bg-brand-bg flex-1 overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
        <header className="mb-6">
          <h1 className="text-[26px] leading-tight font-bold text-gray-900">My feedback</h1>
          <p className="text-[13px] text-gray-400">
            Items you&rsquo;ve submitted via the in-app widget. Reply on any item to keep the
            conversation going — replies notify the dev team.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <p className="text-sm text-gray-500">
              You haven&rsquo;t submitted any feedback yet. Use the floating button
              (bottom-right) or the 💬 icon next to any section.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((r) => {
              const sev = SEVERITY_META[r.severity];
              const st = STATUS_META[r.status];
              const comments = commentsByFeedback[r.id] ?? [];
              return (
                <li
                  key={r.id}
                  className="overflow-hidden rounded-xl bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase",
                        sev.chip,
                      )}
                    >
                      {sev.label}
                    </span>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        st.chip,
                      )}
                    >
                      {st.label}
                    </span>
                    <span className="text-[13px] font-semibold text-gray-700">{r.section}</span>
                    <Link
                      href={r.pagePath}
                      className="hover:text-brand-blue inline-flex items-center gap-1 text-[11px] text-gray-500"
                    >
                      <code className="text-[10px]">{r.pagePath}</code>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    <span className="ml-auto text-[11px] text-gray-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                    {comments.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
                        <MessageSquare className="h-3 w-3" />
                        {comments.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3 px-5 py-4">
                    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                        Original feedback
                      </div>
                      <p className="text-[13px] whitespace-pre-wrap text-gray-700">{r.comment}</p>
                    </div>
                    <CommentThread
                      feedbackId={r.id}
                      comments={comments}
                      currentUserId={me.id}
                      // Submitter view: can only edit/delete their own
                      // comments; owners get the moderator view via
                      // /admin/feedback. Owners landing here happen to also
                      // be submitters of their own items, so this is fine.
                      canModerate={me.role === "owner"}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
