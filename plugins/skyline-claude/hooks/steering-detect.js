/**
 * steering-detect.js — factored symbol-hunt detectors (from skyline-nudge.js)
 * skylence-plugins#20 (R2/R3). Pure detection + routing, no side effects, no I/O except
 * routeLang cwd probe (fail-open).
 *
 * Exports: looksLikeSymbol, isImportHunt, stripRegexFurniture, isDeclHunt,
 *          isMemberHunt, isSymbolHunt, targetsNonCode, routeLang
 *
 * Rewired into skyline-nudge.js; also consumed by skyline-enforce.js for native grep/bash
 * steering append and by new skyline-primer tests (marker logic mirrors).
 */

const fs = require("fs");
const path = require("path");

// --- symbol-hunt detection -------------------------------------------------
// A grep pattern is a symbol hunt if it looks like a declaration/identifier
// search rather than a literal-text search. The original detectors are kept;
// nudge-v2 adds PHP import hunts, normalized declaration hunts, and member hunts.

function looksLikeSymbol(p) {
  if (!p) return false;
  const s = p.trim();
  if (!s) return false;
  // declaration-style symbol search: keyword + a single identifier
  if (
    /^(function|func|fn|def|class|interface|trait|struct|impl|type|enum|module|namespace|method)\s+[A-Za-z_]\w*$/.test(
      s
    )
  )
    return true;
  // bare identifier: Foo, fooBar, foo_bar
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return true;
  // qualified identifier: Foo::bar, foo->bar, foo.bar, Foo\Bar
  if (/^[A-Za-z_][A-Za-z0-9_]*(?:(?:::|->|\.|\\)[A-Za-z_][A-Za-z0-9_]*)+$/.test(s))
    return true;
  return false;
}

// (a) PHP import hunt: matches `use App\Models\User`.
function isImportHunt(p) {
  return /^use\s+[A-Za-z_][A-Za-z0-9_]*(\\[A-Za-z_][A-Za-z0-9_]*)+/.test(p);
}

// Strip regex furniture so a declaration-style pattern like
// `^\s*(final\s+)?class User\b` reduces to plain `class User` before matching.
function stripRegexFurniture(s) {
  return s.replace(
    /\\[sbBdwW]|\((?:\?[:i=!]*)?|\)|[\^\$\?\+\*\|]|\{\d*,?\d*\}|\[[^\]]*\]/g,
    " "
  );
}

// (b) normalized declaration hunt (php/rust/go/generic keywords).
function isDeclHunt(p) {
  return /(?:^|\s)(class|interface|trait|enum|function|fn|func|def|struct|impl|type)\s+([A-Za-z_]\w*)/.test(
    stripRegexFurniture(p)
  );
}

// (c) member/method hunt: `User::posts`, `user->posts`, `foo.bar` (after strip).
function isMemberHunt(p) {
  return /^[A-Za-z_$][\w$]*(::|->|\.)[A-Za-z_]\w*$/.test(
    stripRegexFurniture(p).trim()
  );
}

function isSymbolHunt(p) {
  if (!p) return false;
  return (
    looksLikeSymbol(p) || isImportHunt(p) || isDeclHunt(p) || isMemberHunt(p)
  );
}

// Suppress the nudge when the search is explicitly scoped to non-code files
// (docs / config / data): there the LSP has nothing to offer and grep is right.
function targetsNonCode(glob) {
  if (!glob) return false;
  return /\.(md|markdown|mdx|txt|rst|json|ya?ml|toml|ini|cfg|conf|env|lock|csv|tsv|html?|xml|svg|css|scss|less)(\b|$|["',}\])])/i.test(
    glob
  );
}

// --- language routing ------------------------------------------------------
// Signal precedence (design pad 226 §2 L1): pattern/glob signals outrank cwd
// markers. skyline LSP is php/rust/go-only, so anything else stays generic;
// recommending dead tools is the false-positive mode we avoid.
function routeLang(pattern, glob, cwd) {
  const globPhp = /\.php\b/i.test(glob);
  const globRustGo = /\.(rs|go)\b/.test(glob);
  const nsSig = /[A-Za-z_]\\[A-Za-z_]/.test(pattern);
  // highest precedence: pattern/glob signals
  if (globPhp || isImportHunt(pattern) || nsSig) return "php";
  if (globRustGo) return "rust-go";
  // lower precedence: cwd project markers
  if (cwd) {
    try {
      if (fs.existsSync(path.join(cwd, "composer.json"))) return "php";
      if (
        fs.existsSync(path.join(cwd, "Cargo.toml")) ||
        fs.existsSync(path.join(cwd, "go.mod"))
      )
        return "rust-go";
    } catch (_e) {
      // fail-open: any fs error => fall through to generic
    }
  }
  return "generic";
}

module.exports = {
  looksLikeSymbol,
  isImportHunt,
  stripRegexFurniture,
  isDeclHunt,
  isMemberHunt,
  isSymbolHunt,
  targetsNonCode,
  routeLang,
};
