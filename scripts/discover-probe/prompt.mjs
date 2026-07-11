// The FROZEN 5-task blind-probe prompt (pad 226 §2-L5). T1-T3 are the todo-1260
// originals verbatim; T4 is the rust/go generalization control on binary-skyline;
// T5 is the pure-text false-positive control. The agent is given all five at
// once and is NOT told about the LSP / semantic tools (that is the whole point).
// Frozen: changing this text invalidates cross-run comparability, so edits must
// bump PROMPT_VERSION and be recorded in protocol.md.

export const PROMPT_VERSION = "1.0.0";

export const AUREUSERP = "/Users/jv/Code/aureuserp";
export const BINARY_SKYLINE = "/Users/jv/Code/skylence/binary-skyline";

export const PROMPT = `I'm about to refactor the User model in a Laravel PHP app at ${AUREUSERP}. Before I touch it, help me understand it. Then answer two more unrelated questions. Report concise findings for each, working efficiently.

1. What does the User class in app/Models/User.php extend, and what's its overall shape (key traits/methods)?

2. Find where this User model is used across the codebase, I need the blast radius before refactoring.

3. This repo appears to have several classes named "User". Confirm which class the references in app/Models/User.php actually resolve to, and explain how you can tell them apart.

4. Switching repos: in the Rust project at ${BINARY_SKYLINE}, find the definition of the CompressStats type and list everywhere it is used. Report what it is and its blast radius.

5. Still in ${BINARY_SKYLINE}: I need every place the literal config key string "SKYLINE_DATA_DIR" appears across the repo (code, docs, yaml). Just the raw text occurrences, list them.`;
