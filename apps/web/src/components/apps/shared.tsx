/** Pieces every app page uses; each page dresses them in its own world. */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Globe } from "lucide-react";
import { APPS, type AppEntry, findApp, type Transfer } from "@/catalog";
import { cn } from "@/lib/utils";

/** The other end of a transfer, in plain words. */
export function transferPartner(t: Transfer): { name: string; slug?: string } {
  if (t.with === "dataset") return { name: "Global dataset" };
  if (t.with === "suite") return { name: "Your other DevDAJ apps" };
  const app = findApp(t.with);
  return app ? { name: app.name, slug: app.slug } : { name: t.with };
}

export function otherApps(app: AppEntry): AppEntry[] {
  return APPS.filter((other) => other.slug !== app.slug);
}

export function BackLink({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      hash="apps"
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground no-underline hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      All apps
    </Link>
  );
}

/** Store links and the web app link, or an honest "nothing to download yet" when there are none. */
export function StoreButtons({
  app,
  buttonClass,
  emptyClass,
}: {
  app: AppEntry;
  buttonClass: string;
  emptyClass: string;
}) {
  const { googlePlay, appStore } = app.stores;
  if (!googlePlay && !appStore && !app.webApp)
    return <span className={emptyClass}>Not out yet: nothing to download</span>;
  return (
    <>
      {googlePlay && (
        <a href={googlePlay.url} rel="noopener" className={buttonClass}>
          <Download className="size-5" aria-hidden />
          Get it on Google Play
        </a>
      )}
      {appStore && (
        <a href={appStore.url} rel="noopener" className={buttonClass}>
          <Download className="size-5" aria-hidden />
          Download on the App Store
        </a>
      )}
      {app.webApp && (
        <a href={app.webApp.url} className={buttonClass}>
          <Globe className="size-5" aria-hidden />
          Open the web app
        </a>
      )}
    </>
  );
}

/** Links that keep their app context when they point at another DevDAJ app. */
export function PartnerName({ transfer, className }: { transfer: Transfer; className?: string }) {
  const partner = transferPartner(transfer);
  return partner.slug ? (
    <Link
      to="/apps/$slug"
      params={{ slug: partner.slug }}
      className={cn("text-foreground underline-offset-4 hover:underline", className)}
    >
      {partner.name}
    </Link>
  ) : (
    <span className={className}>{partner.name}</span>
  );
}
