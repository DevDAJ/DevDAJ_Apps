import { Link } from "@tanstack/react-router";
import { APPS, type AppEntry } from "@/catalog";
import { cn } from "@/lib/utils";
import { LINE_INK, SERVICE } from "./lines";

/**
 * The suite as a transit diagram: each app is a line, the encrypted shared folder on the phone is
 * the interchange every line meets at. Lines bend only at 45 and 90 degrees. Two hand-set layouts:
 * a wide one for desktop and a vertical one for phones, so labels never shrink into a miniature.
 */

type Pt = [number, number];
interface Route {
  id: string;
  name: string;
  ink: string;
  planned: boolean;
  /** Polyline from the terminus to the interchange edge. */
  path: Pt[];
  stops: { at: Pt; label: string }[];
  label: { at: Pt; anchor: "start" | "end" | "middle" };
  stopSide: "above" | "below" | "left" | "right";
  app?: AppEntry;
}

interface Layout {
  width: number;
  height: number;
  hub: { x: number; y: number; w: number; h: number };
  routes: Record<
    string,
    { path: Pt[]; stops: Pt[]; label: Route["label"]; stopSide: Route["stopSide"] }
  >;
}

const WIDE: Layout = {
  width: 1200,
  height: 672,
  hub: { x: 540, y: 452, w: 200, h: 56 },
  routes: {
    fitnexx: {
      path: [
        [64, 400],
        [508, 400],
        [560, 452],
      ],
      stops: [
        [220, 400],
        [320, 400],
        [420, 400],
      ],
      label: { at: [44, 444], anchor: "start" },
      stopSide: "below",
    },
    pantry: {
      path: [
        [1136, 400],
        [772, 400],
        [720, 452],
      ],
      stops: [
        [1000, 400],
        [880, 400],
      ],
      label: { at: [1156, 372], anchor: "end" },
      stopSide: "below",
    },
    finance: {
      path: [
        [64, 608],
        [460, 608],
        [560, 508],
      ],
      stops: [
        [220, 608],
        [350, 608],
      ],
      label: { at: [44, 578], anchor: "start" },
      stopSide: "below",
    },
    sync: {
      path: [
        [1136, 608],
        [820, 608],
        [720, 508],
      ],
      stops: [
        [1040, 608],
        [940, 608],
        [830, 608],
      ],
      label: { at: [1156, 578], anchor: "end" },
      stopSide: "below",
    },
    dataset: {
      path: [
        [640, 64],
        [640, 452],
      ],
      stops: [[640, 300]],
      label: { at: [664, 70], anchor: "start" },
      stopSide: "right",
    },
  },
};

const TALL: Layout = {
  width: 360,
  height: 640,
  hub: { x: 100, y: 318, w: 160, h: 52 },
  routes: {
    fitnexx: {
      path: [
        [44, 64],
        [44, 238],
        [124, 318],
      ],
      stops: [
        [44, 120],
        [44, 165],
        [44, 210],
      ],
      label: { at: [44, 40], anchor: "start" },
      stopSide: "right",
    },
    pantry: {
      path: [
        [316, 64],
        [316, 238],
        [236, 318],
      ],
      stops: [
        [316, 135],
        [316, 190],
      ],
      label: { at: [316, 40], anchor: "end" },
      stopSide: "left",
    },
    dataset: {
      path: [
        [180, 96],
        [180, 318],
      ],
      stops: [],
      label: { at: [180, 80], anchor: "middle" },
      stopSide: "right",
    },
    finance: {
      path: [
        [44, 590],
        [44, 450],
        [124, 370],
      ],
      stops: [
        [44, 530],
        [44, 480],
      ],
      label: { at: [44, 622], anchor: "start" },
      stopSide: "right",
    },
    sync: {
      path: [
        [316, 590],
        [316, 450],
        [236, 370],
      ],
      stops: [
        [316, 555],
        [316, 510],
        [316, 465],
      ],
      label: { at: [316, 622], anchor: "end" },
      stopSide: "left",
    },
  },
};

function routesFor(layout: Layout): Route[] {
  const appRoutes = APPS.map((app): Route => {
    const r = layout.routes[app.slug];
    return {
      id: app.slug,
      name: app.name,
      ink: LINE_INK[app.line],
      planned: SERVICE[app.status].planned,
      path: r.path,
      stops: app.stops.slice(0, r.stops.length).map((label, i) => ({ at: r.stops[i], label })),
      label: r.label,
      stopSide: r.stopSide,
      app,
    };
  });
  const dataset = layout.routes.dataset;
  const sync = layout.routes.sync;
  return [
    ...appRoutes,
    {
      id: "dataset",
      name: "Global dataset",
      ink: LINE_INK.cobalt,
      planned: false,
      path: dataset.path,
      stops: dataset.stops.length ? [{ at: dataset.stops[0], label: "Gym map, reviewed" }] : [],
      label: dataset.label,
      stopSide: dataset.stopSide,
    },
    {
      id: "sync",
      name: "Your sync",
      ink: LINE_INK.porcelain,
      planned: true,
      path: sync.path,
      stops: ["Native", "Google Drive", "DevDAJ Sync"].map((label, i) => ({
        at: sync.stops[i],
        label,
      })),
      label: sync.label,
      stopSide: sync.stopSide,
    },
  ];
}

const toD = (path: Pt[]) => path.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");

function stopLabelProps(side: Route["stopSide"], [x, y]: Pt) {
  switch (side) {
    case "above":
      return { x, y: y - 26, textAnchor: "middle" as const };
    case "below":
      return { x, y: y + 38, textAnchor: "middle" as const };
    case "left":
      return { x: x - 22, y: y + 5, textAnchor: "end" as const };
    case "right":
      return { x: x + 22, y: y + 5, textAnchor: "start" as const };
  }
}

/** A short solid run of line centred on a station, along the line's direction. */
function blockPath(side: Route["stopSide"], [x, y]: Pt, half: number) {
  return side === "above" || side === "below"
    ? `M${x - half} ${y} H${x + half}`
    : `M${x} ${y - half} V${y + half}`;
}

function tickPath(side: Route["stopSide"], [x, y]: Pt) {
  if (side === "above") return `M${x} ${y} V${y - 14}`;
  if (side === "below") return `M${x} ${y} V${y + 14}`;
  if (side === "left") return `M${x} ${y} H${x - 14}`;
  return `M${x} ${y} H${x + 14}`;
}

export function TransitMap({
  variant,
  active,
  onActive,
  className,
}: {
  variant: "wide" | "tall";
  active: string | null;
  onActive: (id: string | null) => void;
  className?: string;
}) {
  const layout = variant === "wide" ? WIDE : TALL;
  const routes = routesFor(layout);
  const { hub } = layout;
  const tall = variant === "tall";
  const stroke = tall ? 9 : 12;

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className={cn("block h-auto w-full select-none", className)}
      role="img"
      aria-labelledby={`map-title-${variant}`}
    >
      <title id={`map-title-${variant}`}>
        DevDAJ network: Fitnexx, Finance Tracker and Pantry Helper lines, the global dataset line
        and your sync line all meet at one interchange, the encrypted shared folder on your phone.
        Dashed lines are planned.
      </title>
      {routes.map((route) => {
        const dim = active !== null && active !== route.id;
        const lit = active === route.id;
        const d = toD(route.path);
        const [tx, ty] = route.path[0];
        const body = (
          <g
            className="transition-opacity duration-300 ease-out"
            style={{ opacity: dim ? 0.18 : 1 }}
            onMouseEnter={() => onActive(route.id)}
            onMouseLeave={() => onActive(null)}
          >
            {/* Wide invisible hit area so the line is easy to point at. */}
            <path d={d} stroke="transparent" strokeWidth={40} fill="none" />
            <path
              d={d}
              pathLength={route.planned ? undefined : 1}
              fill="none"
              stroke={route.ink}
              strokeWidth={lit ? stroke + 4 : stroke}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={route.planned ? (tall ? "12 16" : "18 24") : undefined}
              className={cn(
                route.planned ? "transit-planned" : "transit-solid",
                "transition-[stroke-width] duration-300",
              )}
            />
            {route.stops.map((stop) => {
              const label = stopLabelProps(route.stopSide, stop.at);
              return (
                <g key={stop.label}>
                  {route.planned && (
                    // A station on a planned line is a short solid block, so the tick never lands in a dash gap.
                    <path
                      d={blockPath(route.stopSide, stop.at, tall ? 10 : 13)}
                      stroke={route.ink}
                      strokeWidth={stroke}
                      strokeLinecap="butt"
                    />
                  )}
                  <path
                    d={tickPath(route.stopSide, stop.at)}
                    stroke={route.ink}
                    strokeWidth={tall ? 5 : 6}
                    strokeLinecap="butt"
                  />
                  <text
                    {...label}
                    className="fill-foreground/85 font-sans font-semibold"
                    style={{ fontSize: tall ? 12.5 : 15 }}
                  >
                    {stop.label}
                  </text>
                </g>
              );
            })}
            {/* Terminus: a roundel in the line's ink. */}
            <circle
              cx={tx}
              cy={ty}
              r={tall ? 11 : 15}
              fill="var(--background)"
              stroke={route.ink}
              strokeWidth={tall ? 6 : 8}
            />
            <text
              x={route.label.at[0]}
              y={route.label.at[1]}
              textAnchor={route.label.anchor}
              className="fill-foreground font-sans font-extrabold"
              style={{ fontSize: tall ? 15 : 21, letterSpacing: "-0.01em" }}
            >
              {route.name}
            </text>
          </g>
        );
        return route.app ? (
          <Link
            key={route.id}
            to="/apps/$slug"
            params={{ slug: route.id }}
            aria-label={`${route.name}: ${SERVICE[route.app.status].label}`}
            onFocus={() => onActive(route.id)}
            onBlur={() => onActive(null)}
            className="outline-none [&:focus-visible_path:nth-of-type(2)]:stroke-[var(--line-amber)]"
          >
            {body}
          </Link>
        ) : (
          <g key={route.id}>{body}</g>
        );
      })}
      {/* The interchange: the encrypted shared folder on the phone. */}
      <g>
        <rect
          x={hub.x}
          y={hub.y}
          width={hub.w}
          height={hub.h}
          rx={hub.h / 2}
          fill="var(--foreground)"
          stroke="var(--background)"
          strokeWidth={tall ? 6 : 8}
        />
        <text
          x={hub.x + hub.w / 2}
          y={hub.y + hub.h / 2 - (tall ? 3 : 4)}
          textAnchor="middle"
          className="fill-background font-sans font-extrabold"
          style={{ fontSize: tall ? 14 : 19 }}
        >
          Your phone
        </text>
        <text
          x={hub.x + hub.w / 2}
          y={hub.y + hub.h / 2 + (tall ? 13 : 17)}
          textAnchor="middle"
          className="fill-background/75 font-sans font-semibold"
          style={{ fontSize: tall ? 10 : 13 }}
        >
          encrypted shared folder
        </text>
      </g>
    </svg>
  );
}
