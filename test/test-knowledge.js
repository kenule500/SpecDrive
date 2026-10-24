// Context7 download fallback.
//
// The network is replaced with a fake fetch so these checks assert the request
// shape, the saved file, and the overwrite guard without depending on Context7.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const knowledge = require("../src/lib/knowledge");

function fakeFetch(handlers) {
  const calls = [];

  return {
    calls,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      const handler = handlers.find((entry) => String(url).includes(entry.match));

      if (!handler) throw new Error(`Unexpected URL: ${url}`);

      return {
        ok: handler.status === undefined ? true : handler.status < 400,
        status: handler.status || 200,
        text: async () => handler.body
      };
    }
  };
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-knowledge-"));
}

test("downloads a focused Context7 slice and saves it under .sdrive/context/external", async () => {
  const root = tempRoot();
  const { calls, fetchImpl } = fakeFetch([
    {
      match: "/libs/search",
      body: JSON.stringify({ results: [{ id: "/acme/widget", title: "Acme Widget" }] })
    },
    {
      match: "/context",
      body: "## Routing\nCall `widget.route()` before rendering."
    }
  ]);

  try {
    const result = await knowledge.fetchAndWriteContext({
      projectRoot: root,
      library: "acme-widget",
      query: "routing",
      tokens: 1200,
      apiKey: "test-key",
      fetchImpl
    });

    assert.equal(result.library.id, "/acme/widget");
    assert.equal(result.library.title, "Acme Widget");
    assert.equal(result.query, "routing");
    assert.equal(result.tokens, 1200);
    assert.equal(
      result.path,
      path.join(root, ".sdrive", "context", "external", "acme-widget-routing.md")
    );
    assert.equal(result.overwritten, false);

    const saved = fs.readFileSync(result.path, "utf8");
    assert.ok(saved.startsWith(knowledge.GENERATED_MARKER));
    assert.ok(saved.includes("Acme Widget"));
    assert.ok(saved.includes("/acme/widget"));
    assert.ok(saved.includes("routing"));
    assert.ok(saved.includes("widget.route()"));

    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes("libraryName=acme-widget"));
    assert.ok(calls[0].url.includes("query=routing"));
    assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
    assert.ok(calls[1].url.includes("libraryId=%2Facme%2Fwidget"));
    assert.ok(calls[1].url.includes("tokens=1200"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a Context7 id skips the search round-trip", async () => {
  const root = tempRoot();
  const { calls, fetchImpl } = fakeFetch([
    { match: "/context", body: "## Docs\nUse the documented API." }
  ]);

  try {
    const result = await knowledge.fetchAndWriteContext({
      projectRoot: root,
      libraryId: "/vercel/next.js",
      query: "routing",
      tokens: 500,
      fetchImpl
    });

    assert.equal(result.library.id, "/vercel/next.js");
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes("libraryId=%2Fvercel%2Fnext.js"));
    assert.ok(result.path.endsWith("vercel-next.js-routing.md"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("omitting the query uses the overview default", async () => {
  const root = tempRoot();
  const { calls, fetchImpl } = fakeFetch([
    { match: "/context", body: "## Overview\nGeneral documentation." }
  ]);

  try {
    const result = await knowledge.fetchAndWriteContext({
      projectRoot: root,
      libraryId: "/acme/widget",
      fetchImpl
    });

    assert.equal(result.query, "overview");
    assert.ok(calls[0].url.includes("query=overview"));
    assert.ok(result.path.endsWith("acme-widget-overview.md"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("no search result is an explicit error, not invented documentation", async () => {
  const { fetchImpl } = fakeFetch([
    { match: "/libs/search", body: JSON.stringify({ results: [] }) }
  ]);

  await assert.rejects(
    () =>
      knowledge.resolveLibrary("does-not-exist", {
        fetchImpl
      }),
    /found no library matching/
  );
});

test("refuses to overwrite a file SpecDrive did not generate unless forced", async () => {
  const root = tempRoot();
  const target = path.join(root, ".sdrive", "context", "external", "acme-widget-overview.md");

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "hand-written notes\n", "utf8");

    const { fetchImpl } = fakeFetch([
      { match: "/context", body: "## Docs\nGenerated content." }
    ]);

    await assert.rejects(
      () =>
        knowledge.fetchAndWriteContext({
          projectRoot: root,
          libraryId: "/acme/widget",
          fetchImpl
        }),
      /Refusing to overwrite/
    );

    const forced = await knowledge.fetchAndWriteContext({
      projectRoot: root,
      libraryId: "/acme/widget",
      force: true,
      fetchImpl
    });

    assert.equal(forced.overwritten, true);
    assert.ok(fs.readFileSync(target, "utf8").startsWith(knowledge.GENERATED_MARKER));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a generated cache file is refreshed without --force", async () => {
  const root = tempRoot();

  try {
    const first = fakeFetch([
      { match: "/context", body: "## Docs\nFirst version." }
    ]);
    const one = await knowledge.fetchAndWriteContext({
      projectRoot: root,
      libraryId: "/acme/widget",
      fetchImpl: first.fetchImpl
    });

    const second = fakeFetch([
      { match: "/context", body: "## Docs\nSecond version." }
    ]);
    const two = await knowledge.fetchAndWriteContext({
      projectRoot: root,
      libraryId: "/acme/widget",
      fetchImpl: second.fetchImpl
    });

    assert.equal(one.path, two.path);
    assert.equal(two.overwritten, true);
    assert.ok(fs.readFileSync(two.path, "utf8").includes("Second version."));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
