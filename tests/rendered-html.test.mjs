import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds a Vercel-ready Rapid reader", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(html, /<title>Rapid — RSVP Speed Reader<\/title>/i);
  assert.match(html, /src="\/assets\//);
  assert.match(app, /Random find \/ Wikipedia/);
  assert.match(app, /sanitizeWikipediaText/);
  assert.match(app, /beginPendingArticle/);
  assert.match(app, /Discover an article/);
  assert.match(app, /Read this article/);
  assert.match(app, /aria-label="Reading position"/);
  assert.match(app, /en\.wikipedia\.org\/w\/api\.php/);
  assert.match(app, /Category:Science/);
  assert.match(app, /Wikipedia topic/);
  assert.match(app, /Back to topics/);
  assert.match(app, /Reading length/);
  assert.match(app, /\[200, 300, 600, 1200\]/);
  assert.match(app, /Wikipedia topic lookup/);
  assert.match(app, /Category:Visual_arts/);
});
