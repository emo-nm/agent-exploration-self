// Generate src/skills/research-and-publish/SKILL.md from @demo/prompts.
//
// Flue skills are static SKILL.md files imported with `with { type: 'skill' }`
// at build time, so they cannot import a string from a TS package at runtime.
// To keep @demo/prompts the single source of truth for the shared "brain"
// (import, don't fork), we codegen the SKILL.md from it before every
// build/dev/typecheck. This file is generated — edit @demo/prompts instead.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RESEARCH_AND_PUBLISH_SKILL_MD } from "@demo/prompts";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../src/skills/research-and-publish/SKILL.md");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, RESEARCH_AND_PUBLISH_SKILL_MD, "utf8");
console.log(`[flue] generated ${out} from @demo/prompts`);
