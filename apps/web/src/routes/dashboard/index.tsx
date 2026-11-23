import { createFileRoute } from "@tanstack/react-router";
import { AdminOverview } from "@/components/dashboard/AdminOverview";
import { ContributorOverview } from "@/components/dashboard/ContributorOverview";
import { MaintainerOverview } from "@/components/dashboard/MaintainerOverview";
import { useDashboard } from "@/lib/dashboard/store";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

function Overview() {
  const { role } = useDashboard();
  if (role === "admin") return <AdminOverview />;
  if (role === "maintainer") return <MaintainerOverview />;
  return <ContributorOverview />;
}
