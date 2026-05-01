import { FileText } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";

export default function HomePage() {
  return (
    <>
      <Sidebar />
      <main className="flex flex-1 items-center justify-center overflow-y-auto p-10">
        <div className="text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h1 className="mb-2 text-xl font-semibold text-gray-700">No deal selected</h1>
          <p className="max-w-sm text-sm text-gray-500">
            Pick a deal from the sidebar to view its checklist, contacts, Q&amp;A, issues, and
            consultant roster.
          </p>
        </div>
      </main>
    </>
  );
}
