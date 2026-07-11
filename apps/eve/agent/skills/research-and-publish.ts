// The research-and-publish skill. Its content is the shared, canonical text
// from @demo/prompts — referenced, never forked. eve cannot `import` into a
// static SKILL.md, so to keep a single source of truth we author the skill in
// TypeScript with defineSkill; eve compiles this into the packaged
// `skills/research-and-publish/SKILL.md` at build time (see findings).
import { defineSkill } from "eve/skills";
import { RESEARCH_AND_PUBLISH_SKILL_MD } from "@demo/prompts";

// The shared constant is a full SKILL.md (frontmatter + body). defineSkill
// takes `description` + `markdown` (body only) and regenerates the frontmatter,
// so split the shared text rather than restating it here.
function parseSkillMarkdown(source: string): {
  description: string;
  markdown: string;
} {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { description: "Research a topic and publish after approval.", markdown: source.trim() };
  }
  const [, frontmatter, body] = match;
  const descLine = frontmatter
    .split("\n")
    .find((l) => l.trim().startsWith("description:"));
  const description = descLine
    ? descLine.slice(descLine.indexOf(":") + 1).trim()
    : "Research a topic and publish after approval.";
  return { description, markdown: body.trim() };
}

const { description, markdown } = parseSkillMarkdown(RESEARCH_AND_PUBLISH_SKILL_MD);

export default defineSkill({ description, markdown });
