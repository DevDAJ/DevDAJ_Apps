import { createFileRoute } from "@tanstack/react-router";
import { ApiAnalytics } from "@/components/dashboard/ApiAnalytics";
import { DeveloperApi } from "@/components/dashboard/DeveloperApi";
import { useDashboard } from "@/lib/dashboard/store";

export const Route = createFileRoute("/dashboard/api")({ component: ApiPage });

function ApiPage() {
  const { role } = useDashboard();
  return role === "admin" ? <ApiAnalytics /> : <DeveloperApi />;
}
