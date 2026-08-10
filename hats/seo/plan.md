# /seo-plan — SEO plan

Plan an SEO initiative as three genuinely distinct strategies, then stop for a human decision. Use the **three-approaches** skill.

## Interrogate first

- What page or query is losing, and to whom? A concrete SERP, not "traffic is down".
- What is the searcher actually trying to do, and where do we fail them today?
- What does success look like as a number — ranking position, impressions, qualified sessions, assisted conversions?
- What can't change — the CMS, the URL structure, a brand constraint, a crawl budget?
- What has already been tried and failed?

## Write the plan

Write `.hatstack/plans/<slug>.md`, record its path in `.hatstack/active-plan`. Three `## Approach N` sections (e.g. *new hub-and-spoke cluster* vs *consolidate and redirect thin pages* vs *earn links to the existing page*), each with **Pros**, **Cons**, **Reversibility**, **Cost**. Reversibility matters more than usual here — a redirect or a de-index is expensive to walk back.

The `## Success criteria` section is load-bearing for non-code hats: the accept gate blocks writing briefs/content until it exists, and the reviewer ticks each box against the produced artifact. Make them observable:

```markdown
## Success criteria
- [ ] 12 target keywords mapped to existing or new URLs, no two pages competing for one
- [ ] every brief states the search intent and the specific SERP gap it exploits
- [ ] internal links from 3+ existing ranking pages planned per new page
```

Present the approaches to the human and stop. Write `APPROVED:` only when they answer — never on your own authority.
