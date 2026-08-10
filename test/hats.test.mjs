import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const HATS = ["eng", "seo", "marketing", "accounting", "ceo"];

test("every hat ships a plan and a reviewer rubric", () => {
  for (const hat of HATS) {
    assert.ok(existsSync(join(PKG, "hats", hat, "plan.md")), `${hat} missing plan.md`);
    assert.ok(existsSync(join(PKG, "hats", hat, "reviewer.md")), `${hat} missing reviewer.md`);
  }
});

test("every reviewer rubric mandates a Verdict and an Inventory", () => {
  for (const hat of HATS) {
    const r = readFileSync(join(PKG, "hats", hat, "reviewer.md"), "utf8");
    assert.match(r, /## Verdict/, `${hat} rubric has no Verdict section`);
    assert.match(r, /BLOCK \| APPROVE WITH FINDINGS \| APPROVE/, `${hat} rubric missing the verdict scale`);
    assert.match(r, /Inventory/, `${hat} rubric has no Inventory requirement`);
  }
});

test("non-code hat plans require observable success criteria", () => {
  for (const hat of ["seo", "marketing", "accounting", "ceo"]) {
    const p = readFileSync(join(PKG, "hats", hat, "plan.md"), "utf8");
    assert.match(p, /## Success criteria/, `${hat} plan does not require success criteria`);
    assert.match(p, /- \[ \]/, `${hat} plan shows no checkbox example`);
  }
});

test("every Claude reviewer agent embeds its canonical hat rubric verbatim (no drift)", () => {
  const map = {
    eng: "eng-reviewer",
    seo: "seo-reviewer",
    marketing: "mkt-reviewer",
    accounting: "acct-reviewer",
    ceo: "ceo-reviewer",
  };
  for (const [hat, agentName] of Object.entries(map)) {
    const rubric = readFileSync(join(PKG, "hats", hat, "reviewer.md"), "utf8").trim();
    const agent = readFileSync(join(PKG, "adapters", "claude-code", "agents", `${agentName}.md`), "utf8");
    assert.ok(agent.startsWith("---"), `${agentName} missing frontmatter`);
    assert.ok(agent.includes(rubric), `${agentName} has drifted from hats/${hat}/reviewer.md`);
  }
});

test("every hat has namespaced plan and review commands", () => {
  const cmds = readdirSync(join(PKG, "adapters", "claude-code", "commands"));
  for (const prefix of ["eng", "seo", "mkt", "acct", "ceo"]) {
    assert.ok(cmds.includes(`${prefix}-plan.md`), `missing ${prefix}-plan command`);
    assert.ok(cmds.includes(`${prefix}-review.md`), `missing ${prefix}-review command`);
  }
});
