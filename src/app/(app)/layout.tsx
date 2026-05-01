import { PriorityRibbon } from "@/components/layout/priority-ribbon";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen flex-col">
      <PriorityRibbon />
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
