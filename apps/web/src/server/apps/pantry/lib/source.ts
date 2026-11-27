import { ApiError } from "../../../shared/errors";

export type RecipeSource = "youtube" | "tiktok";

export type ParsedVideoUrl =
  | { source: RecipeSource; sourceId: string; url: string }
  | { shortLink: string };

const MAX_URL_LENGTH = 500;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com", "www.tiktok.com"]);
const TIKTOK_VIDEO = /^\/@[^/]+\/(?:video|photo)\/(\d+)\/?$/;

function invalid(): never {
  throw new ApiError(400, "Paste a YouTube or TikTok video link.");
}

/** Normalize a pasted video link into a canonical URL and platform id, or a short link to resolve. */
export function parseVideoUrl(input: unknown): ParsedVideoUrl {
  if (typeof input !== "string") invalid();
  const trimmed = input.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_URL_LENGTH) invalid();

  let parsed: URL | null = null;
  try {
    parsed = new URL(trimmed);
  } catch {
    invalid();
  }
  if (!parsed) invalid();
  const url = parsed;
  if (url.protocol !== "https:" && url.protocol !== "http:") invalid();
  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1).split("/")[0]
        : url.pathname === "/watch"
          ? (url.searchParams.get("v") ?? "")
          : /^\/(?:shorts|live|embed)\//.test(url.pathname)
            ? url.pathname.split("/")[2]
            : "";
    if (!YOUTUBE_ID.test(id)) invalid();
    return {
      source: "youtube",
      sourceId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  }

  if (TIKTOK_SHORT_HOSTS.has(host)) {
    const shortCode =
      host === "www.tiktok.com"
        ? /^\/t\/([^/]+)\/?$/.exec(url.pathname)?.[1]
        : /^\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    if (shortCode) {
      url.protocol = "https:";
      return { shortLink: url.toString() };
    }
  }

  if (TIKTOK_HOSTS.has(host)) {
    const match = TIKTOK_VIDEO.exec(url.pathname);
    if (match) {
      const [, id] = match;
      const user = /^\/@([^/]+)\//.exec(url.pathname)?.[1];
      if (!user) invalid();
      return {
        source: "tiktok",
        sourceId: id,
        url: `https://www.tiktok.com/@${user}/video/${id}`,
      };
    }
  }

  invalid();
}
