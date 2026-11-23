import { createFileRoute, notFound } from "@tanstack/react-router";
import { findApp } from "@/catalog";
import { FinancePage } from "@/components/apps/FinancePage";
import { FitnexxPage } from "@/components/apps/FitnexxPage";
import { PantryPage } from "@/components/apps/PantryPage";

/*
 * Each app page is its own world with its own layout: the root shell sets [data-app=<slug>] so
 * app.css swaps ground, ink, shape and display face, and each slug gets its own page component.
 * Only the landing page uses the metro-line theme.
 */
export const Route = createFileRoute("/apps/$slug")({
  loader: ({ params }) => {
    const app = findApp(params.slug);
    if (!app) throw notFound();
    return app;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} · Apps by DevDAJ` },
          { name: "description", content: loaderData.description },
        ]
      : [],
  }),
  component: AppPage,
});

function AppPage() {
  const app = Route.useLoaderData();
  if (app.slug === "fitnexx") return <FitnexxPage app={app} />;
  if (app.slug === "pantry") return <PantryPage app={app} />;
  return <FinancePage app={app} />;
}
