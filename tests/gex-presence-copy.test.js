"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("GEX card labels count as browser sessions and keeps self-hosted copy", () => {
  assert.match(
    html,
    /Active browser sessions:\s*<span id="gex-online">0<\/span>/
  );
  assert.match(html, /href="https:\/\/github\.com\/adamk\/foxchase-gex"/);
  assert.match(html, /Self-run SPX and NDX 0DTE gamma-exposure dashboard/);
  assert.match(html, /Requires an approved Schwab\s+Individual Developer app/);
  assert.match(
    html,
    /Your Schwab credentials and OAuth token stay on your computer\./
  );
});

test("GEX counter still displays the backend online count without login", async () => {
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .find(contents => contents.includes("presenceSources"));
  assert.ok(script, "homepage counter fetch script exists");

  const elements = new Map(
    ["exz-online", "gex-online"].map(id => [id, {textContent: "0"}])
  );
  const calls = [];
  const context = {
    document: {getElementById: id => elements.get(id) || null},
    fetch: async url => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({online: url.includes("community/presence") ? 5 : 2})
      };
    },
    Number,
    String,
    Math,
    Promise
  };
  vm.runInNewContext(script, context);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(elements.get("gex-online").textContent, "5");
  assert.ok(calls.includes(
    "https://compute.foxchasetrading.com/api/community/presence"
  ));
});
