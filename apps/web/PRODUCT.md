# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Privacy-minded, tech-savvy people choosing phone apps for daily life (fitness, money, food). They
pick apps because their data stays on the device, and they read how an app handles data before
installing it.

## Product Purpose

DevDAJ is a suite of small, privacy-first mobile apps by one indie maker. The website lists every
app, gives each app its own landing page with download links, hosts contributions to the shared
global dataset, and gives the maker an admin dashboard.

Success: a visitor understands that the apps are private, that they can talk to each other on the
phone, and that they can install only the ones they need, then opens an app's page and downloads it.

## Positioning

A suite of privacy-first apps that communicate with one another on the device, and you choose which
ones you need. Each app keeps its own SQLite database in a shared, key-encrypted folder
(`<shared folder>/<app>/data.sqlite3`) that the other DevDAJ apps can read, so connected features
(for example meals from Pantry Helper showing in Fitnexx) work without a cloud in the middle.

## Operating Context

- Apps: Fitnexx (fitness tracker, beta, Android), Finance Tracker (coming soon), Pantry Helper
  (coming soon). Source of truth: `src/catalog.ts`.
- Sync options per user: Native sync (default iOS/Android, short-lived), Google Drive (user
  provided), DevDAJ Sync (fully encrypted, only the user's key can decrypt).
- AI helpers are opt-in, not the default: a small free daily allowance (no ads, ever) or a monthly
  subscription for unlimited AI calls. The apps carry no ad SDKs.
- Global dataset: public data the apps rely on (first: gym map and equipment). Signed-in users
  contribute; an admin reviews before publishing.
- Structure: the main page lists the apps; each app has its own landing page, and one section of
  every app page shows how that app works with the other apps in the suite.

## Capabilities and Constraints

- One shared DevDAJ account (Supabase) across apps and the website.
- On iOS, sharing uses the app group `group.tech.devdaj.shared`; on Android, a signature-level
  permission. All apps must come from the same developer to read each other's data.
- Undecided: pricing of the AI subscription, iOS release dates, which cross-app features ship first.

## Brand Commitments

- Name: DevDAJ. The site brands as "Apps" with a small "by DevDAJ"; the mark is four line inks
  meeting at one interchange ring.
- Personal indie maker, not a company. Owner's steer (2026-11-20): a clean, modern product-site
  feel close to familiar SaaS, but not generic: the metro-line map hero and the line inks are the
  signature and must stay. Avoid gradient heroes and "Get started" everywhere.
- Each app page is its own world (own ground, ink and display face) tied to the suite by the
  shared header and line motif.

## Evidence on Hand

None yet: no logo, app screenshots, testimonials, user numbers, or press. Never fabricate any.
Illustrative app UI or data must be labelled as illustrative until real screenshots exist.

## Product Principles

1. Your data stays on your device unless you choose otherwise.
2. Apps are better together, but each one stands alone: install only what you need.
3. Opt-in, never default: AI and cloud sync are choices.
4. Show how it works; privacy is demonstrated, not claimed.
