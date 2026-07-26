// node:test for skyline-primer.js (skylence-plugins#20 R3).
// Run with: node --test plugins/skyline-claude/hooks/skyline-primer.test.js
// Uses spawnSync + temp marker dirs (composer.json / Cargo.toml), like nudge tests.
// Covers: php context, rust/generic context, no-marker empty, malformed stdin => 0 empty.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.resolve(__dirname, "skyline-primer.js");

function markerDir(file) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "primer-marker-"));
  fs.writeFileSync(path.join(d, file), "{}");
  return d;
}

function run(input, env = {}) {
  return spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: JSON.stringify(input),
    // Hermetic by default: the operator's real ~/.skylence/skylore.db and
    // ~/.claude/plugins/installed_plugins.json must not leak into marker
    // tests, or they fail only on a machine that actually has these things
    // installed. Callers that exercise lore/blueprint override explicitly.
    env: {
      ...process.env,
      SKYLORE_DB: path.join(os.tmpdir(), "primer-no-such-bank.db"),
      CLAUDE_CONFIG_DIR: path.join(os.tmpdir(), "primer-no-such-claude-dir"),
      ...env,
    },
  });
}

function fakeBank() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "primer-bank-"));
  const f = path.join(d, "skylore.db");
  fs.writeFileSync(f, "");
  return { dir: d, db: f };
}

function cleanup(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

const PHP_CTX = "Skyline semantic PHP tools are active here. For symbol questions (where is X defined, who calls Y, which same-named class resolves), don't conclude from text counts: run skyline_symbol_card(path, line, symbol) or skyline_references and reconcile. A name_only hit is unconfirmed until you verify its receiver, and if symbol_card's count disagrees with a grep count, decompose by receiver. Read symbol_card's provenance and freshness before assuming the index is degraded; use skyline_grep for literal text only.";

const RUST_CTX = "Skyline semantic tools active. For symbol questions, don't conclude from grep counts: run skyline_definition, skyline_references, or skyline_implementation and reconcile any unproven hit by checking its receiver; read the tool's freshness before assuming degradation.";

// Shared substrings for the #411 orientation contract (env facts front-loaded).
// FOCUS_LINE stops before the em dash on purpose: keeps this source em-dash-free.
const ABS_PREFIX = "The skyline daemon runs with cwd /";
const FOCUS_LINE = "Harness task-tracker reminders are noise on linear single-feature jobs";
const GITLESS_LINE = "No git in this workspace";

test("php marker gives the exact php context", () => {
  const php = markerDir("composer.json");
  try {
    const res = run({ cwd: php });
    assert.equal(res.status, 0);
    const s = res.stdout.trim();
    assert.ok(s, "emitted output");
    const parsed = JSON.parse(s);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.startsWith(ABS_PREFIX), "env facts front-loaded");
    assert.ok(ctx.includes(PHP_CTX), "php steer kept verbatim");
    // no permissionDecision per spec
    assert.ok(!("permissionDecision" in parsed.hookSpecificOutput));
  } finally {
    cleanup(php);
  }
});

test("rust marker gives the generic (rust-go) context line", () => {
  const rust = markerDir("Cargo.toml");
  try {
    const res = run({ cwd: rust });
    assert.equal(res.status, 0);
    const s = res.stdout.trim();
    assert.ok(s);
    const parsed = JSON.parse(s);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.startsWith(ABS_PREFIX), "env facts front-loaded");
    assert.ok(ctx.includes(RUST_CTX), "rust/go steer kept verbatim");
  } finally {
    cleanup(rust);
  }
});

test("no marker, no bank: still emits the always-on env facts, no steer", () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "primer-plain-"));
  try {
    const res = run({ cwd: plain });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.ok(ctx.startsWith(ABS_PREFIX), "abs-path env fact always emitted");
    assert.ok(ctx.includes(FOCUS_LINE), "focus-license line present");
    assert.ok(!ctx.includes("skyline_lore_recall"), "no lore steer without a bank");
    assert.ok(!ctx.includes(PHP_CTX) && !ctx.includes(RUST_CTX), "no language steer without a marker");
  } finally {
    cleanup(plain);
  }
});

test("malformed stdin exits 0 empty", () => {
  const res = spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: "{ not json",
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
});

test("lore context is emitted when the bank exists, regardless of language marker", () => {
  const bank = fakeBank();
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "primer-plain-"));
  try {
    const res = run({ cwd: plain }, { SKYLORE_DB: bank.db });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.match(ctx, /skyline_lore_recall/);
    assert.match(ctx, /skyline_lore_mark/);
    // the routing rule is the point: it must name all three tiers
    assert.match(ctx, /skyline_memory_\*/);
    assert.match(ctx, /skybox/);
  } finally {
    cleanup(bank.dir);
    cleanup(plain);
  }
});

test("no bank means no lore context (never advertise an empty bank)", () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "primer-plain-"));
  try {
    const res = run({ cwd: plain }, { SKYLORE_DB: path.join(plain, "absent.db") });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.ok(ctx.startsWith(ABS_PREFIX), "env facts still emitted");
    assert.ok(!ctx.includes("skyline_lore_recall"), "absent bank => no lore steer");
  } finally {
    cleanup(plain);
  }
});

test("php marker and lore bank compose without clobbering each other", () => {
  const php = markerDir("composer.json");
  const bank = fakeBank();
  try {
    const res = run({ cwd: php }, { SKYLORE_DB: bank.db });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.ok(ctx.startsWith(ABS_PREFIX), "env facts front-loaded before steer");
    assert.ok(ctx.includes(PHP_CTX), "php steer kept verbatim");
    assert.match(ctx, /skyline_lore_recall/);
  } finally {
    cleanup(php);
    cleanup(bank.dir);
  }
});

test("#411 git-less workspace: orientation includes the no-git fact", () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "primer-nogit-"));
  try {
    const res = run({ cwd: plain }, { CLAUDE_PROJECT_DIR: plain });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.ok(ctx.startsWith(ABS_PREFIX), "abs-path env fact front-loaded");
    assert.ok(ctx.includes(FOCUS_LINE), "focus-license line present");
    assert.match(ctx, /No git in this workspace/);
    assert.match(ctx, /pint --dirty is a no-op/);
    assert.match(ctx, /binary-skyline#719/);
  } finally {
    cleanup(plain);
  }
});

test("#411 git workspace: no-git fact suppressed when .git is present", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "primer-git-"));
  fs.mkdirSync(path.join(repo, ".git"));
  try {
    const res = run({ cwd: repo }, { CLAUDE_PROJECT_DIR: repo });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.ok(ctx.startsWith(ABS_PREFIX), "abs-path env fact front-loaded");
    assert.ok(ctx.includes(FOCUS_LINE), "focus-license line present");
    assert.ok(!ctx.includes(GITLESS_LINE), "no-git fact suppressed when .git present");
  } finally {
    cleanup(repo);
  }
});

test("#415 F1: repo SUBDIR (git at ancestor) suppresses the no-git fact", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "primer-sub-"));
  const deep = path.join(repo, "src", "deep");
  fs.mkdirSync(path.join(repo, ".git"));
  fs.mkdirSync(deep, { recursive: true });
  try {
    const res = run({ cwd: deep }, { CLAUDE_PROJECT_DIR: deep });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.ok(ctx.startsWith(ABS_PREFIX), "env facts still front-loaded");
    assert.ok(!ctx.includes(GITLESS_LINE), "ancestor .git suppresses the no-git fact");
  } finally {
    cleanup(repo);
  }
});

test("#415 F1: unknown location (no CLAUDE_PROJECT_DIR, no cwd) says nothing about git", () => {
  const res = run({}, { CLAUDE_PROJECT_DIR: "" });
  assert.equal(res.status, 0);
  const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
  assert.ok(ctx.startsWith(ABS_PREFIX), "orientation still emitted");
  assert.ok(!ctx.includes(GITLESS_LINE), "no fabricated no-git fact for unknown location");
});

// ---- skyrift orientation facts ----
const SKYRIFT_WS_LINE = "skyrift copy-on-write workspace";
const SKYRIFT_PROMOTE = "skyrift promote";
const SKYRIFT_FANOUT_LINE = "skyrift create";

function skyriftWorkspaceDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "primer-skyrift-ws-"));
  fs.mkdirSync(path.join(d, ".git")); // a real workspace is a detached clone
  fs.writeFileSync(path.join(d, ".skyrift-workspace"), "{}");
  return d;
}
function gitDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "primer-git-"));
  fs.mkdirSync(path.join(d, ".git"));
  return d;
}
function fakeSkyriftBin() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "primer-skyrift-bin-"));
  const f = path.join(d, "skyrift");
  fs.writeFileSync(f, "#!/bin/sh\necho 'skyrift 0.1.0'\n");
  fs.chmodSync(f, 0o755);
  return d;
}

test("a .skyrift-workspace marker gives the land-with-promote orientation", () => {
  const ws = skyriftWorkspaceDir();
  try {
    const res = run({ cwd: ws }, { CLAUDE_PROJECT_DIR: ws });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput
      .additionalContext;
    assert.ok(ctx.includes(SKYRIFT_WS_LINE), "workspace orientation present");
    assert.ok(ctx.includes(SKYRIFT_PROMOTE), "promote guidance present");
    assert.ok(
      !ctx.includes(SKYRIFT_FANOUT_LINE),
      "fan-out hint suppressed inside a workspace"
    );
  } finally {
    cleanup(ws);
  }
});

test("a git source with skyrift on PATH gives the fan-out hint, not the workspace fact", () => {
  const src = gitDir();
  const bin = fakeSkyriftBin();
  try {
    const res = run(
      { cwd: src },
      { CLAUDE_PROJECT_DIR: src, PATH: bin + path.delimiter + process.env.PATH }
    );
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput
      .additionalContext;
    assert.ok(ctx.includes(SKYRIFT_FANOUT_LINE), "fan-out hint present");
    assert.ok(!ctx.includes(SKYRIFT_WS_LINE), "no workspace fact outside a workspace");
    assert.ok(!ctx.includes(GITLESS_LINE), "git source is not gitless");
  } finally {
    cleanup(src);
    cleanup(bin);
  }
});

test("a git source without skyrift emits neither skyrift line", () => {
  const src = gitDir();
  const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), "primer-empty-bin-"));
  try {
    const res = run({ cwd: src }, { CLAUDE_PROJECT_DIR: src, PATH: emptyBin });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput
      .additionalContext;
    assert.ok(!ctx.includes(SKYRIFT_WS_LINE));
    assert.ok(!ctx.includes(SKYRIFT_FANOUT_LINE));
  } finally {
    cleanup(src);
    cleanup(emptyBin);
  }
});

// ---- blueprint invocation enforcement (Lane H) ----

function composerDir(content) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "primer-composer-"));
  fs.writeFileSync(path.join(d, "composer.json"), content);
  return d;
}

function cargoDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "primer-cargo-"));
  fs.writeFileSync(path.join(d, "Cargo.toml"), '[package]\nname = "x"\n');
  return d;
}

function goModDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "primer-gomod-"));
  fs.writeFileSync(path.join(d, "go.mod"), "module x\n");
  return d;
}

// A fake ~/.claude tree with exactly the given blueprint skills installed,
// wired through installed_plugins.json the same way a real install is.
function fakeClaudeConfig(skillNames) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "primer-claude-"));
  const installPath = path.join(
    root,
    "plugins",
    "cache",
    "fake-marketplace",
    "fake-plugin",
    "0.0.1"
  );
  const skillsDir = path.join(installPath, "skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  for (const name of skillNames) {
    fs.mkdirSync(path.join(skillsDir, name));
  }
  fs.writeFileSync(
    path.join(root, "plugins", "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: {
        "fake-plugin@fake-marketplace": [{ scope: "user", installPath }],
      },
    })
  );
  return root;
}

test("filament composer.json + all three blueprint skills installed: names all three, filament-implies chain order", () => {
  const app = composerDir(JSON.stringify({ require: { "filament/filament": "^5.0" } }));
  const claude = fakeClaudeConfig([
    "filament-blueprint-skill",
    "livewire-blueprint-skill",
    "laravel-blueprint-skill",
  ]);
  try {
    const res = run({ cwd: app }, { CLAUDE_CONFIG_DIR: claude });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.match(
      ctx,
      /invoke `filament-blueprint-skill`, `livewire-blueprint-skill`, `laravel-blueprint-skill`/
    );
    assert.match(ctx, /before the first edit/);
  } finally {
    cleanup(app);
    cleanup(claude);
  }
});

test("filament composer.json, only laravel-blueprint-skill installed: names only the installed one", () => {
  const app = composerDir(JSON.stringify({ require: { "filament/filament": "^5.0" } }));
  const claude = fakeClaudeConfig(["laravel-blueprint-skill"]);
  try {
    const res = run({ cwd: app }, { CLAUDE_CONFIG_DIR: claude });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.match(ctx, /invoke `laravel-blueprint-skill`/);
    assert.ok(!ctx.includes("filament-blueprint-skill"));
    assert.ok(!ctx.includes("livewire-blueprint-skill"));
  } finally {
    cleanup(app);
    cleanup(claude);
  }
});

test("livewire (non-filament) composer.json: names livewire+laravel, never filament", () => {
  const app = composerDir(JSON.stringify({ require: { "livewire/livewire": "^3.0" } }));
  const claude = fakeClaudeConfig([
    "filament-blueprint-skill",
    "livewire-blueprint-skill",
    "laravel-blueprint-skill",
  ]);
  try {
    const res = run({ cwd: app }, { CLAUDE_CONFIG_DIR: claude });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.match(ctx, /invoke `livewire-blueprint-skill`, `laravel-blueprint-skill`/);
    assert.ok(!ctx.includes("filament-blueprint-skill"));
  } finally {
    cleanup(app);
    cleanup(claude);
  }
});

test("laravel-only composer.json + laravel-blueprint-skill installed: names laravel-blueprint-skill", () => {
  const app = composerDir(JSON.stringify({ require: { "laravel/framework": "^12.0" } }));
  const claude = fakeClaudeConfig(["laravel-blueprint-skill"]);
  try {
    const res = run({ cwd: app }, { CLAUDE_CONFIG_DIR: claude });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.match(ctx, /invoke `laravel-blueprint-skill` \(Skill tool\) at plan time/);
  } finally {
    cleanup(app);
    cleanup(claude);
  }
});

test("laravel composer.json, blueprint skill not installed: no injection (zero noise)", () => {
  const app = composerDir(JSON.stringify({ require: { "laravel/framework": "^12.0" } }));
  try {
    const res = run({ cwd: app }); // default env: no such CLAUDE_CONFIG_DIR
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.ok(!ctx.includes("blueprint-skill"));
  } finally {
    cleanup(app);
  }
});

test("non-stack composer.json (plain php lib): no injection even with every blueprint skill installed", () => {
  const app = composerDir(JSON.stringify({ require: { "monolog/monolog": "^3.0" } }));
  const claude = fakeClaudeConfig([
    "filament-blueprint-skill",
    "livewire-blueprint-skill",
    "laravel-blueprint-skill",
  ]);
  try {
    const res = run({ cwd: app }, { CLAUDE_CONFIG_DIR: claude });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.ok(!ctx.includes("blueprint-skill"));
  } finally {
    cleanup(app);
    cleanup(claude);
  }
});

test("Cargo.toml + rust-blueprint-skill installed: names rust-blueprint-skill", () => {
  const app = cargoDir();
  const claude = fakeClaudeConfig(["rust-blueprint-skill"]);
  try {
    const res = run({ cwd: app }, { CLAUDE_CONFIG_DIR: claude });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.match(ctx, /invoke `rust-blueprint-skill` \(Skill tool\)/);
  } finally {
    cleanup(app);
    cleanup(claude);
  }
});

test("go.mod, blueprint skill not installed: no injection", () => {
  const app = goModDir();
  try {
    const res = run({ cwd: app });
    assert.equal(res.status, 0);
    const ctx = JSON.parse(res.stdout.trim()).hookSpecificOutput.additionalContext;
    assert.ok(!ctx.includes("blueprint-skill"));
  } finally {
    cleanup(app);
  }
});
