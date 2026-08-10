// Parse a hatstack plan markdown file into a structured shape. Pure: no I/O,
// no decisions. gates.mjs turns this into allow/deny. Keeping parsing separate
// from policy is what lets the same plan feed the plan gate and the accept gate.

const TRADEOFFS = ["Pros", "Cons", "Reversibility", "Cost"];

// A tradeoff label may appear as **Pros:**, **Pros**, or ### Pros.
function hasLabel(body, label) {
  const bold = new RegExp(`(^|\\n)\\s*\\*\\*${label}:?\\*\\*`, "i");
  const heading = new RegExp(`(^|\\n)\\s*#{1,6}\\s+${label}\\b`, "i");
  return bold.test(body) || heading.test(body);
}

// Split the document into level-2 (##) sections. Anything before the first ##
// is the preamble and is returned under the empty heading.
function sections(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let current = { heading: "", body: [] };
  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      out.push(current);
      current = { heading: m[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  out.push(current);
  return out.map((s) => ({ heading: s.heading, body: s.body.join("\n") }));
}

export function parsePlan(md) {
  const text = String(md ?? "");
  const secs = sections(text);

  const approaches = [];
  let hasSuccessSection = false;
  let hasConstrainedSpace = false;
  const criteria = [];

  for (const { heading, body } of secs) {
    if (/^Approach\s+\d+/i.test(heading)) {
      approaches.push({
        name: heading,
        tradeoffs: Object.fromEntries(TRADEOFFS.map((t) => [t, hasLabel(body, t)])),
        missing: TRADEOFFS.filter((t) => !hasLabel(body, t)),
      });
    }
    if (/^Constrained\s+space/i.test(heading)) hasConstrainedSpace = true;
    if (/^Success\s+criteria/i.test(heading)) {
      hasSuccessSection = true;
      for (const line of body.split(/\r?\n/)) {
        const m = /^\s*[-*]\s*\[([ xX])\]\s*(.*)$/.exec(line);
        if (m) criteria.push({ checked: m[1].toLowerCase() === "x", text: m[2].trim() });
      }
    }
  }

  // APPROVED: is a whole-line marker anywhere in the document. Non-empty trailing
  // text is the human's signature; a bare "APPROVED:" does not count as approved.
  let approved = null;
  const am = /^APPROVED:\s*(.*)$/m.exec(text);
  if (am && am[1].trim().length > 0) approved = am[1].trim();

  return {
    approaches,
    approachCount: approaches.length,
    hasConstrainedSpace,
    hasSuccessSection,
    criteria,
    approved,
  };
}
