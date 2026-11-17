# AegisPulse: M&A / Investor Pitch Deck (10 slides)

**Format:** 16:9, dark theme matching the product (near-black `#05070a` background, cyan `#22d3ee` accent, red `#ef4444` for threat moments), Inter for text, JetBrains Mono for code and indicators. One idea per slide; no slide has more than ~25 words of on-screen text.

**Length:** 12 minutes plus 8 minutes of Q&A. Slide 4 is a live demo, with a recorded backup ready.

**Golden rule for this deck:** every number on screen must be one the buyer can verify in the repository or the pilot data. Due-diligence teams check, and a single inflated metric costs more credibility than it buys.

---

## Slide 1: Hook

**Layout:** Full-bleed dark background. Center: a single Telegram-style message card. Below it, a cyan line and the product name.

**On screen:**
> *"FRESH DROP: 1,400 AWS keypairs leaked from CI logs… 312 keys still LIVE."*
>
> **Your team finds out in days. AegisPulse finds it, judges it and writes the fix, automatically.**
>
> AEGISPULSE · Autonomous AI Threat Intelligence

**Script (45 s):**
"This message is the kind of thing posted in Telegram channels every day. It's from our simulator, but the pattern is real: leaked cloud keys, live, for sale. The question every security team faces is whether it's about *them*, and what to do in the next hour. Most can't answer that fast. AegisPulse can, and that's what I'll show you in the next twelve minutes."

---

## Slide 2: The problem

**Layout:** Left: a vertical "firehose" graphic of sources (NVD, Telegram, paste sites, dark-web markets) pouring into a single small analyst icon. Right: three short pain statements.

**On screen:**
- Thousands of signals a day. A handful matter to *you*.
- "Does this affect us?" takes hours of research.
- Intel without a fix is just anxiety.

**Script (60 s):**
"Mid-market companies, with fifty to a thousand employees and real internet-facing products, have one to five people doing security. They subscribe to feeds, but feeds produce reading, not decisions. Every item needs the same three questions answered: is it real, does it touch our stack, what do we do. That's manual analyst work, and attackers move faster than it."

---

## Slide 3: The solution

**Layout:** Three columns, one per agent, connected by arrows, with a fourth box "Human approves" at the end.

**On screen:**
1. **Agent 1 · Triage:** real or noise, severity 0–10, verified IoCs
2. **Agent 2 · Context:** MITRE ATT&CK mapping, *your* exposure
3. **Agent 3 · Remediation:** patch script, WAF/firewall rule, detection rule
→ **Analyst approves. Nothing runs without a human.**

**Script (60 s):**
"AegisPulse is three specialised AI agents in a pipeline. The first decides whether an item is real and how severe it is. The second maps it to MITRE ATT&CK and checks it against the customer's actual technology stack. The third writes the fix: a reversible patch script, a firewall or WAF rule, and a detection rule for their SIEM. Then a human approves it, because in security an AI that acts on its own is a liability."

---

## Slide 4: Live demo

**Layout:** Full-screen product. Presenter switches to the browser.

**Demo flow (4 minutes, rehearsed):**

| Step | Click | Say |
|---|---|---|
| 1 | Dashboard already logged in, feed empty or with previous items | "This is the SOC command center for a fintech running AWS, Ubuntu, Nginx, PostgreSQL." |
| 2 | **Trigger Live Dark Web Attack ▾ → "AWS IAM credential dump leaked on Telegram"** | "Let's inject a real-world style leak." |
| 3 | Watch the feed item and the Agent 1 → 2 → 3 progress cards | "Agent 1 is triaging… Agent 2 is calling its ATT&CK tools… Agent 3 is writing remediation." |
| 4 | Inspector → purple banner "Prompt-injection attempt detected" | "The post tells AI analysts to rate it severity zero. AegisPulse flags the manipulation and refuses to downgrade." |
| 5 | **MITRE ATT&CK** tab | "Validated techniques along the kill chain. Every ID is checked against the catalog, so none can be hallucinated." |
| 6 | **Remediation** tab → **Simulate Execution** | "A reversible script with rollback, statically checked. It never executes on our side." |
| 7 | **Approve**, then **Dispatch Alert** → preview | "One click to approve, one click to WhatsApp and Slack." |
| 8 | **Tech Stack** → toggle AWS off | "Change the stack and every threat re-ranks instantly, with no extra AI cost." |
| 9 | **Download STIX 2.1** | "And it drops straight into their existing SIEM." |

**Backup:** a screen recording of exactly this flow, in case of network issues.

---

## Slide 5: Why it's hard to copy (security moat)

**Layout:** Left: the attacker's message with the injected instruction highlighted in red. Right: a checklist of defences with green ticks.

**On screen:**
- Hostile input by design → engineered defences
- Hallucinated IoCs are dropped automatically
- ATT&CK IDs validated · tools are read-only
- Scripts never executed · human approval required
- Defences mutation-tested: removing a control fails the suite

**Script (60 s):**
"Any AI product that reads dark-web content is reading text written by attackers. Most AI tools would follow an instruction hidden in that text. Ours is built to treat it as evidence, not commands, and we prove it: when we removed each control in testing, the test suite failed. That engineering discipline is the hard part to replicate."

---

## Slide 6: Technology & readiness

**Layout:** Architecture diagram (from the memorandum §4) on the left; readiness table on the right.

**On screen:**

| | |
|---|---|
| AI | Claude multi-agent pipeline, structured outputs, tool use |
| Backend | FastAPI · PostgreSQL + pgvector · Redis worker |
| Frontend | Next.js · TypeScript · live SSE dashboard |
| Platform | Multi-tenant · roles · audit log · retention |
| Quality | 112 automated tests · CI · 0 known dependency CVEs |
| Deploy | One `docker compose` stack · Nginx + Let's Encrypt guide |

**Script (45 s):**
"This isn't a prototype held together for a demo. It's multi-tenant, role-based and audited, with CI, migrations, and a deployment guide that takes it to a live server in under an hour. A buyer's engineering team can verify every line of this slide in the repository."

---

## Slide 7: Market

**Layout:** Bottom-up funnel: segment → reachable accounts → price → revenue. Assumptions printed in small text under each step.

**On screen:**
- **Who:** mid-market companies with an internet-facing product and a 1–5 person security/DevOps team
- **Price:** USD 490 – 1,490 / month (pilot-tested hypothesis)
- **Illustration:** 300 customers × USD 1,490 × 12 = **USD 5.4M ARR**

**Script (60 s):**
"We size this bottom-up, because that's what an acquirer can underwrite. The customer is a mid-market company with a real attack surface and a small team. At our Business-tier price, three hundred customers is about five point four million in annual recurring revenue. That figure is an illustration from stated assumptions, not a forecast. For a security vendor with an existing customer base, the more interesting number is the attach rate on accounts they already serve."

**Note to presenter:** if a buyer asks for top-down TAM, quote a named, current analyst report on the threat-intelligence market with its publication date, and only one you've read yourself.

---

## Slide 8: Business model & go-to-market

**Layout:** Three pricing cards; below them, a 4-week pilot timeline.

**On screen:**

| Starter | Business | Enterprise |
|---|---|---|
| USD 490/mo | USD 1,490/mo | from USD 40k/yr |
| NVD + Telegram, Slack/WhatsApp | + dark-web feed, SIEM export, API | + on-prem, SLA, custom collectors |

Pilot: 4 weeks free → KPIs (alert relevance ≥ 70%, ≥ 3 deployed fixes) → conversion.

**Script (45 s):**
"Pricing is a hypothesis we test in the pilots, not a claim. The pilot program is fully designed, with target profile, four-week plan, success metrics and outreach, so an acquirer can start selling the week after closing."

*(Update this slide with real pilot names and KPI results as soon as they exist. Real traction replaces everything on this slide.)*

---

## Slide 9: Status, honestly

**Layout:** Two columns: "Done" (green) and "Next 90 days" (cyan).

**On screen:**

| Done | Next 90 days |
|---|---|
| Full product, multi-tenant, audited | Live AI benchmark on real Claude output |
| Collectors: NVD, Telegram, paste, dark-web feed | First 3–5 pilots running |
| Security self-assessment, SOC 2 mapping, legal draft | SSO/MFA, external pentest |
| CI, migrations, deployment guide | Semantic correlation (pgvector embeddings) |

**Script (45 s):**
"Here's exactly where we are. We're pre-revenue. The product is built and tested; what's next is proving it with live data and real customers. We've written the diligence documents ourselves, including the gaps, because you'll find them anyway, and we'd rather you hear it from us."

---

## Slide 10: The ask / exit strategy

**Layout:** Left: three buyer profiles. Right: the offer and contact.

**On screen:**
- **Security vendors:** AI remediation layer on top of existing intel / EDR data
- **MSSPs:** multiply analyst capacity across client tenants
- **SaaS operators:** a ready product with a clear recurring-revenue path

**Offer:** full asset acquisition: code, IP, brand, docs, transition support
**Range:** USD 250k – 600k today · USD 1.2M+ with active pilots

**Script (60 s):**
"We see three kinds of buyers. A security vendor gets an AI-native remediation layer for its existing data. An MSSP gets an analyst multiplier across clients. A SaaS operator gets a product ready to sell. The offer is the whole asset with transition support. Today's range reflects a tested, deployable product; with pilots running, the conversation becomes about revenue. Thank you. Happy to go deeper on any part, including the code."

---

## Anticipated Q&A (prepare these answers)

| Question | Honest answer |
|---|---|
| "What's your MTTR on real data?" | "Platform overhead is ~0.2 s per threat; total time is dominated by model latency, which we'll benchmark on live data in the first pilot week. The dashboard measures it automatically." |
| "Why not just use ChatGPT/Claude directly?" | "Raw LLMs hallucinate indicators and follow injected instructions. The value is the grounding, validation, stack matching, tenancy and workflow around the model." |
| "Model dependency risk?" | "Model and effort are configuration. The pipeline's contracts are Pydantic schemas, so swapping models is a config change plus re-running the evaluation." |
| "Is collecting dark-web data legal?" | "We don't crawl Tor ourselves; dark-web data comes from licensed vendor feeds. Our policy draft with open questions for counsel is in the data room." |
| "Revenue?" | "None yet. The pilot program is ready to launch, and that's the main lever on valuation." |
