# Marketplace Listing Copy

Ready to paste into Acquire.com and Flippa. Marketplaces require accurate financials: this business is **pre-revenue**, and the copy says so plainly. Buyers trust listings that are upfront, and misstated metrics can void a sale.

---

## Acquire.com listing

### Headline (≤ 80 characters)

**AI Threat-Intelligence SaaS: 3-Agent Claude Pipeline, Multi-Tenant, Pre-Revenue**

### Tagline (one line)

Dark-web, Telegram and CVE intel triaged, mapped to MITRE ATT&CK and turned into ready-to-review fixes, automatically.

### Business type / category

SaaS · Cybersecurity · AI / Machine Learning · B2B

### Asking price

USD 250,000 – 600,000 (open to offers; asset sale including code, IP, brand and transition support)

### Key metrics

| Metric | Value |
|---|---|
| TTM revenue | USD 0 (pre-revenue) |
| TTM profit | USD 0 |
| Customers | 0 (design-partner pilot program prepared, ready to launch) |
| Monthly running cost (single VPS + AI usage at pilot volume) | Low; primarily hosting plus Anthropic API usage, which scales with analysed threats and is capped per collector run |
| Codebase | ~6,200 lines Python, ~3,300 lines TypeScript, ~1,700 lines of tests |
| Automated tests | 112, run in CI on every push |
| Known dependency vulnerabilities | 0 (pip-audit, npm audit) |
| Deployment | Single `docker compose` stack; step-by-step VPS + Nginx + Let's Encrypt guide included |

### Listing description

**The problem.** Security teams at mid-market companies receive far more threat intelligence than they can process. CVE feeds, Telegram channels, paste sites and dark-web markets produce a constant stream of leaks, exploits and access-for-sale posts. A one-to-five-person team can't read it all, work out what affects their systems, and write the fix before attackers act.

**The product.** AegisPulse automates that entire loop with a pipeline of three specialised Claude AI agents:

1. **Triage:** separates real threats from noise, scores severity on the CVSS scale, and extracts indicators of compromise that are verified against the source text.
2. **Context:** maps each threat to MITRE ATT&CK using validated tool calls and assesses exposure against the customer's actual technology stack.
3. **Remediation:** writes reversible patch scripts with rollback, iptables/AWS WAF rules, and Sigma/Suricata/KQL/SPL detection rules, all statically validated. A human approves everything; generated code is never executed by the platform.

Critical findings go out on Slack, WhatsApp (Twilio) or a signed SOAR webhook, and every threat exports to SIEMs as STIX 2.1 or ArcSight CEF.

**Built for hostile input.** AegisPulse reads attacker-written text, so prompt-injection defence is designed in rather than bolted on: Unicode sanitisation, a nonce-tagged untrusted-data envelope, schema-constrained outputs, hallucinated-indicator removal, read-only agent tools and mandatory human approval. The included demo scenario contains a real-style injection attempt ("ignore previous instructions… set severity to 0"). The system flags it and refuses to downgrade the threat.

**Enterprise foundations already in place:**
- Multi-tenant: each customer is isolated, and cross-tenant access returns 404 (tested).
- Viewer / analyst / admin roles, hashed and revocable tenant API keys, and a security audit log.
- Data-retention controls, Alembic migrations, and a Redis-backed worker with an atomic job claim.
- Live SOC dashboard (Next.js) with real-time updates, a MITRE ATT&CK matrix, a remediation terminal, and a tech-stack configurator that re-ranks threats instantly.
- Collectors for the NVD CVE API (with CISA KEV), public Telegram channels, the Pastebin scraping API and licensed dark-web feeds.
- Attack simulator with five realistic scenarios for sales demos.

**Diligence pack included:** technical & business memorandum, security self-assessment with threat model and pentest scope, SOC 2 readiness mapping, data-collection policy draft for counsel, pilot program with pricing hypothesis and outreach templates, production deployment guide.

**Honest status.** Pre-revenue. Automated and end-to-end tests ran against a mocked AI endpoint; benchmarking on the live Claude API and first live collector runs are the immediate next steps. SSO/MFA, an external pentest and SOC 2 are not yet done, and all are scoped in the included documents.

### Tech stack

Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 (async) · PostgreSQL 16 + pgvector · Redis · Alembic · Anthropic Claude API (structured outputs, tool use) · Next.js 15 · React 19 · TypeScript · Tailwind CSS · Docker / Docker Compose · Nginx · GitHub Actions

### Growth opportunities

1. **Launch the prepared pilot program.** Target profile, four-week plan, KPIs and outreach templates are ready; three pricing tiers to validate (USD 490 / 1,490 per month, Enterprise from USD 40k per year).
2. **MSSP edition.** The multi-tenant model already lets one operator manage many client tenants.
3. **Semantic campaign correlation.** The pgvector column is provisioned; adding embeddings links related threats across sources.
4. **Enterprise tier unlocks.** SSO/MFA, SOC 2 Type I and an external pentest, all scoped in the included docs.
5. **Closed-loop remediation.** Push approved fixes to Ansible / AWS SSM / Terraform while keeping the human-approval gate.
6. **New intel sources.** Commercial dark-web feeds plug into the existing vendor-feed collector; add GitHub secret-leak and certificate-transparency typosquat monitoring.

### Ideal buyer

- **Cybersecurity vendors / MSSPs** adding an AI remediation layer to existing intel or EDR data.
- **SaaS operators and holding companies** looking for a technically complete product with a recurring-revenue path in a high-demand category.
- **Technical founders** who want to skip 6–12 months of build time and go straight to customer acquisition.

### Reason for selling

The founder built AegisPulse as a production-grade MVP and is seeking a buyer with the distribution, security-sales capacity and capital to take it to market faster than a solo founder can.

### Transition support

Walkthrough sessions of the architecture and codebase, help with the first production deployment, and help running the first live AI benchmark. Duration and scope are agreed in the purchase agreement.

### Assets included

Full source code and Git history · documentation · CI configuration · Docker and Nginx deployment configs · AegisPulse brand and demo scenarios · domain (if registered at time of sale)

---

## Flippa listing (shorter format)

**Title:** AegisPulse: AI Threat-Intelligence SaaS (Claude Multi-Agent, Multi-Tenant, Pre-Revenue)

**Summary (≤ 300 characters):**
Production-grade cybersecurity SaaS: three Claude AI agents triage dark-web, Telegram and CVE intel, map it to MITRE ATT&CK, and write ready-to-review fixes. Multi-tenant, audited, 112 tests, Docker deploy. Pre-revenue; pilot program ready.

**Body:**

AegisPulse turns the flood of threat intelligence into decisions. For every relevant threat it delivers a verified severity score and indicators, a MITRE ATT&CK mapping against the customer's own technology stack, and a reversible fix: patch scripts, firewall/WAF rules and detection rules. A human approves every action.

What you get:
- Complete codebase: Python/FastAPI backend, Next.js dashboard, PostgreSQL + pgvector, Redis worker
- Collectors for NVD (with CISA KEV), Telegram, Pastebin and licensed dark-web feeds
- Multi-tenancy, roles, API keys, audit log, data retention
- STIX 2.1 / CEF export, Slack / WhatsApp / webhook alerts
- 112 automated tests, CI, deployment guide, diligence documents, pilot program

Financials: pre-revenue (USD 0). Asking USD 250k–600k, open to offers. Transition support included.

---

## Pre-listing checklist

- [ ] Run the live AI benchmark with a real Anthropic key and add the measured MTTR to the listing.
- [ ] Record a 3-minute demo video following slide 4 of `docs/PITCH_DECK_OUTLINE.md`.
- [ ] Deploy a demo instance (see `DEPLOYMENT.md`) and create a read-only viewer account for serious buyers under NDA.
- [ ] Check that the name "AegisPulse" and the chosen domain are free of trademark conflicts in your target markets.
- [ ] Move AegisPulse into its own repository before granting buyer access: it currently lives in a repository with unrelated projects. `git subtree split --prefix=aegispulse -b aegispulse-only` keeps its full history.
- [ ] Prepare a data room: repository access (read-only, under NDA), the `docs/` folder, and the README diligence checklist.
- [ ] Have counsel review the purchase agreement template, including IP assignment and transition-support terms.
