import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = ["three-approaches", "red-green-refactor", "adversarial-review"];

test("every skill ships a SKILL.md with name/description frontmatter", () => {
  for (const s of SKILLS) {
    const p = join(PKG, "skills", s, "SKILL.md");
    assert.ok(existsSync(p), `${s} missing SKILL.md`);
    const body = readFileSync(p, "utf8");
    assert.ok(body.startsWith("---"), `${s} missing frontmatter`);
    assert.match(body, /name:\s*\S+/, `${s} missing name`);
    assert.match(body, /description:\s*\S+/, `${s} missing description`);
  }
});

test("the three-approaches skill points at the load-bearing plan structure", () => {
  const body = readFileSync(join(PKG, "skills", "three-approaches", "SKILL.md"), "utf8");
  assert.match(body, /\.hatstack\/active-plan/);
  assert.match(body, /Never write the APPROVED line/i);
});
