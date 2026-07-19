// SessionStart nudge (plugin tia-harness): sugere rodar tia.init UMA linha, apenas
// enquanto o CLAUDE.md do projeto não tiver o bloco do guia. Com o bloco presente,
// sai em silêncio — as `instructions` do MCP já cobrem o conhecimento ambiente.
import { readFileSync } from "node:fs";

let text = "";
try {
  text = readFileSync("CLAUDE.md", "utf8");
} catch {
  // sem CLAUDE.md ainda → nudge
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
