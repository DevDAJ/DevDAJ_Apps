import { expect, test } from "vite-plus/test";
import { ApiError } from "../../../shared/errors";
import { parseVideoUrl } from "./source";

const YT_ID = "dQw4w9WgXcQ";
const YT_URL = `https://www.youtube.com/watch?v=${YT_ID}`;
const VIDEO_ID = "1234567890123456789";
const TIKTOK_URL = `https://www.tiktok.com/@cook/video/${VIDEO_ID}`;

test.each([
  `https://www.youtube.com/watch?v=${YT_ID}`,
  `https://youtube.com/watch?v=${YT_ID}`,
  `https://m.youtube.com/watch?v=${YT_ID}`,
  `https://music.youtube.com/watch?v=${YT_ID}`,
  `https://youtu.be/${YT_ID}`,
  `https://www.youtube.com/shorts/${YT_ID}`,
  `https://www.youtube.com/live/${YT_ID}`,
  `https://www.youtube.com/embed/${YT_ID}`,
  `http://youtu.be/${YT_ID}?t=30`,
])("parses YouTube link %s", (input) => {
  expect(parseVideoUrl(input)).toEqual({ source: "youtube", sourceId: YT_ID, url: YT_URL });
});

test.each([
  `https://www.tiktok.com/@cook/video/${VIDEO_ID}`,
  `https://tiktok.com/@cook/video/${VIDEO_ID}`,
  `https://m.tiktok.com/@cook/video/${VIDEO_ID}`,
  `https://www.tiktok.com/@cook/photo/${VIDEO_ID}`,
])("parses TikTok link %s", (input) => {
  expect(parseVideoUrl(input)).toEqual({ source: "tiktok", sourceId: VIDEO_ID, url: TIKTOK_URL });
});

test.each([
  [`https://vm.tiktok.com/ZMabc123/`, `https://vm.tiktok.com/ZMabc123/`],
  [`https://vt.tiktok.com/ZMabc123?x=1`, `https://vt.tiktok.com/ZMabc123?x=1`],
  [`http://www.tiktok.com/t/ZMabc123`, `https://www.tiktok.com/t/ZMabc123`],
])("returns short link %s for resolution", (input, expected) => {
  expect(parseVideoUrl(input)).toEqual({ shortLink: expected });
});

test.each([
  "not a url",
  1234,
  "javascript:alert(1)",
  "file:///tmp/video.mp4",
  `https://example.com/watch?v=${YT_ID}`,
  `https://www.youtube.com/watch?v=short`,
  `https://www.youtube.com/watch?v=dQw4w9WgXcQextra`,
  `https://www.youtube.com/watch?v=bad!dQw4w9WgX`,
  "https://youtu.be/",
  "https://www.youtube.com/feed/you",
  "https://www.tiktok.com/@cook/video/abc",
  "https://www.tiktok.com/cook/video/123",
  "https://www.tiktok.com/@cook",
  "https://www.tiktok.com/t/",
  `https://vimeo.com/${VIDEO_ID}`,
  `https://x.com/${"a".repeat(500)}`,
])("rejects invalid input %s", (input) => {
  let error: unknown;
  try {
    parseVideoUrl(input);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(400);
  expect((error as ApiError).message).toBe("Paste a YouTube or TikTok video link.");
});
