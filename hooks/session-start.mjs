// SessionStart nudge (tia-harness plugin): suggests running tia.init in ONE line, only
// while the project's CLAUDE.md lacks the guide block. Once the block is present, it
// exits silently — the MCP `instructions` already cover the ambient knowledge.
import { readFileSync } from "node:fs";

let text = "";
try {
  text = readFileSync("CLAUDE.md", "utf8");
} catch {
  // no CLAUDE.md yet → nudge
}
if (text.includes("<!-- tia-harness:start -->")) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        "The tia-harness plugin is installed but this project's CLAUDE.md has no harness guide block yet. " +
        "Suggest running the tia.init skill once to inject the TIA operating guide (gates, gotchas, pipeline) " +
        "between idempotent markers.",
    },
  }),
);
