---
version: 1
slug: "src-routes-index-tsx"
primary_target: "src/routes/index.tsx"
related_targets: ["src/routes/apps/$slug.tsx"]
---

# Apps pages (landing + per-app)

Scope: `/` (suite landing, app list) and `/apps/<slug>` (each app's landing page). Mode: Persuade.
Audience: privacy-minded, tech-savvy phone users. Action: open an app's page and download it.
Proof on hand: none (no screenshots, logo, numbers). Cross-app links shown only as confirmed facts
from `src/catalog.ts`; anything not shipped is marked planned. Built on shadcn/ui (user-pinned).
Must not feel like generic SaaS or corporate.

## Direction contract

THESIS: A clean, light product site whose signature is the transit network. Each app is a coloured line; the encrypted shared folder on your phone is the interchange where every line meets. Familiar SaaS structure (framed hero, cards, panels, CTA band) carried by line inks, station rings and the map.

OWN-WORLD: Light near-white ground, ink-navy text, Geist. Line inks scarlet (Fitnexx), amber (Finance), green (Pantry), cobalt (dataset and site accent). Soft two-layer shadows, 0.75rem base radius, 1.75rem hero panels, pill buttons. Lines bend only at 45/90 degrees; planned is dashed.

APP WORLDS: Only the landing page is metro. /apps/<slug> sets [data-app] and renders its own page: Fitnexx rugged grid (charcoal steel grid, square welded cells, hazard tape for planned, Big Shoulders uppercase); Pantry home kitchen (cream, tomato/basil/butter, gingham, jar shelf and steaming pot, recipe card, Bricolage); Finance ledger (graphite ruled paper, amber margin, Fraunces). Landing app cards preview each world in their top half.

STORY: Visitor sees lines converging on "your phone" in a framed map, picks a line from cards that preview each app's world, reads how the network works, downloads.

FIRST VIEWPORT: Framed map panel with the headline in its quiet upper-left corner; primary "Explore the apps", secondary "How it works". Phones: headline first, tall map in a panel below.

SIGNATURE INTERACTION: Focusing a line (map or app card) brightens it and dims the rest; lines draw in once on load.
