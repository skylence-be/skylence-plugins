# Discover-probe adoption report

- agent: `claude-opus`
- session_id: `probe-a-1614`
- generated_at: 2026-07-11T07:38:38.500Z

## Verdict
- semantic tool used (session): **no**
- distinct tool calls: 6
- grep calls before first semantic call: 4
- semantic tools: (none)
- text tools: skyline_grep, skyline_read
- GATE-B pass: **no**

## Per-task (attribution: session-level best-effort)
- **T1** (php-symbol), User model shape / extends: semantic_used=no
- **T2** (php-symbol), usages / blast-radius (caller count): semantic_used=no
- **T3** (php-symbol), multi-User disambiguation / resolution: semantic_used=no
- **T4** (rustgo-symbol), rust/go symbol task (generalization control): semantic_used=no
- **T5** (text), pure text config-key hunt (false-positive control): semantic_used=no

## T2 caller-count parity
- class: **text-633** (404 seen: no, 633 seen: yes)

## T5 nudge cross-check
- php nudge fires this session: 0 (pass: yes)
- fired langs: (none)

## Ordered distinct tool calls
1. `skyline_grep` [text] (pattern: "^\\s*(final\\s+)?class User\\b", path: "/Users/jv/Code/aureuserp", glob: "*.php", limit: 100)
2. `skyline_grep` [text] (pattern: "use App\\\\Models\\\\User\\b", path: "/Users/jv/Code/aureuserp", glob: "*.php", count_only: true)
3. `skyline_grep` [text] (pattern: "use App\\\\Models\\\\User\\b", path: "/Users/jv/Code/aureuserp", glob: "*.php", limit: 50)
4. `skyline_grep` [text] (pattern: "Webkul\\\\Security\\\\Models\\\\User\\b", path: "/Users/jv/Code/aureuserp", glob: "*.php", count_only: true)
5. `skyline_read` [text] (path: "/Users/jv/Code/aureuserp/plugins/webkul/security/src/Models/User.php")
6. `skyline_read` [text] (path: "/Users/jv/Code/aureuserp/config/auth.php")
