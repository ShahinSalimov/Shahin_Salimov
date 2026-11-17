# Data Collection & Processing Policy (DRAFT)

> **Status: engineering draft for legal review. Not legal advice.** It describes what the software actually does, so a lawyer can check it against the laws of every country where AegisPulse is operated or sold (for example the EU GDPR and the Republic of Azerbaijan's Law "On Personal Data") and turn it into binding policy, terms of service and a Data Processing Agreement (DPA). Open questions for counsel are marked **Q**.

## 1. What AegisPulse collects

| Source | Mechanism in code | Access model | Notes for counsel |
|---|---|---|---|
| NVD CVE feed | `backend/collectors/nvd.py`: NIST public REST API 2.0, optional API key | Public government data | **Q1:** Confirm any attribution requirement for NVD / CISA KEV data in the product and exports. |
| Public Telegram channels | `backend/collectors/telegram.py`: public web preview `https://t.me/s/<channel>` for channels the **operator explicitly lists** | Public, read-only, no account, no private chats/groups | **Q2:** Is automated reading of Telegram's public web preview allowed under Telegram's Terms of Service? Is rate/volume limiting required? |
| Paste sites | `backend/collectors/paste.py`: Pastebin Scraping API (PRO account, whitelisted IP) or a compatible endpoint | Licensed API | **Q3:** Confirm that commercial use of Pastebin scraping-API data in a paid product is covered by the PRO terms. |
| Dark-web intelligence | `backend/collectors/darkweb_feed.py`: HTTPS JSON feed from a **licensed vendor** or an in-house crawler | Contractual | AegisPulse itself does **not** crawl Tor or criminal forums. **Q4:** What contract clauses do we need from feed vendors (lawful collection warranties, redistribution rights, indemnity)? |
| Customer input | `POST /api/threats/ingest`, tenant API keys | Customer-provided | Customer is the controller of what they upload. |
| Demo simulator | `backend/simulator.py` | Synthetic | Fictional IoCs from RFC 5737 documentation ranges; no real victim data. |

## 2. Personal data that may be present

Threat intelligence regularly contains personal data. Leaked credential dumps hold emails and passwords, forum posts carry actor handles, and breach notices name victims. AegisPulse:

* stores the raw text (`threat_events.raw_text`) so analysts can verify the AI's conclusions;
* extracts indicators (IPs, domains, hashes, emails, access-key IDs) into `threat_events.indicators`;
* sends the text to the AI provider (Anthropic) for analysis (see §4);
* does **not** attempt to log in with leaked credentials, contact victims, or enrich data about individuals.

**Q5:** What is our legal basis for processing this data? Candidate: the legitimate interest of network and information security, the recital 49 rationale under GDPR. What is the equivalent ground under Azerbaijani law?
**Q6:** Do we need a Data Protection Impact Assessment (DPIA) before launch? It likely applies given the large-scale processing of breach data.
**Q7:** Are we a controller, a processor, or both, for (a) collector data and (b) customer-uploaded data?

## 3. Minimisation & retention (implemented controls)

| Control | Where | Default |
|---|---|---|
| Relevance pre-filter: non-security chatter is never stored | `backend/collectors/base.py::is_security_relevant` | On |
| Per-run volume cap | `AEGIS_COLLECTOR_MAX_ITEMS_PER_RUN` | 25 |
| Stack gating: CVEs only stored for tenants whose stack matches | `backend/collector_runner.py` | On |
| Raw-text redaction after N days | `AEGIS_RAW_TEXT_RETENTION_DAYS`, enforced by the worker (`backend/audit.py::apply_retention`) | Off (0). **Set before production.** |
| Audit-log retention | `AEGIS_AUDIT_RETENTION_DAYS` | 400 days |
| Tenant isolation: one customer never sees another's data | `backend/security.py`, all endpoints | Enforced, tested |

**Q8:** Which retention periods should we commit to: raw text 30/90 days, analysis results, audit logs? Should indicators that are personal data, such as emails, also expire?
**Q9:** How do we handle data-subject requests (access, erasure) for people who appear in a leak? A technical erasure-by-indicator endpoint can be built once the policy is defined.

## 4. Sub-processors

| Sub-processor | Purpose | Data sent |
|---|---|---|
| Anthropic (Claude API) | AI analysis | Sanitised intel text, company tech-stack names |
| Twilio (optional) | WhatsApp alerts | Alert summary (title, severity, IoCs) |
| Slack (optional) | Alerts | Alert summary |
| Customer-configured webhook | SOAR integration | Alert summary |
| Hosting provider (TBD) | Infrastructure | All data at rest |

**Q10:** Confirm Anthropic's commercial terms and data-retention settings fit our DPA (zero-retention options, region). Do we need customer opt-in before sending their uploaded data to an AI provider?
**Q11:** Cross-border transfer mechanisms (for example EU SCCs) for each sub-processor.

## 5. Security commitments to customers (technical facts for the DPA)

* Passwords are hashed with scrypt; session tokens are HMAC-signed and expire after 12 hours by default.
* Only SHA-256 hashes of API keys are stored; keys can be revoked.
* Role-based access (viewer / analyst / admin) and an append-only audit trail of security-relevant actions.
* AI-generated scripts are never executed by the platform; they need human approval.
* TLS termination is the deployer's responsibility (see README). Database encryption at rest depends on the hosting provider. **To decide.**

## 6. Before the first paying customer

- [ ] Counsel answers Q1–Q11 and approves this policy.
- [ ] Terms of Service, Privacy Notice and DPA drafted from this document.
- [ ] Vendor contracts in place for any dark-web feed.
- [ ] Retention periods configured in production `.env`.
- [ ] DPIA completed if counsel confirms it is required.
