# AegisPulse Pilot Program

Goal: 3–5 design-partner companies running AegisPulse on their real stack for 4 weeks, producing usage data, testimonials and at least one conversion to paid. For an investor or acquirer this evidence matters more than any feature.

## 1. Who to target (ideal pilot customer)

| Criterion | Why |
|---|---|
| 50–1,000 employees, internet-facing product (fintech, e-commerce, SaaS, logistics, telecom resellers) | Real attack surface, but no 24/7 threat-intel team |
| 1–5 person security / DevOps team | Feels the alert-fatigue pain; can decide quickly |
| Runs a stack AegisPulse knows (AWS/Azure/GCP, Linux, Nginx/Apache, PostgreSQL/MySQL, Docker/Kubernetes) | Stack-aware prioritisation shows value on day one |
| Has Slack or WhatsApp for on-call | Zero-touch alerting is visible immediately |
| A named champion (CISO, Head of Infra, CTO) | Pilots without an owner stall |

Avoid for now: banks or government bodies that need on-prem deployment and long procurement (keep them for after SOC 2), and companies with no technical staff.

## 2. The offer

* **Free for 4 weeks**, then 50% off the first year for design partners who give feedback calls and a reference.
* Hosted by us (one tenant per pilot), or deployed in their cloud with `docker compose`.
* What they give: tech-stack list, one Slack channel or WhatsApp number, 30 minutes every week.
* What they get: daily stack-relevant threat intel (NVD + Telegram OSINT + optional dark-web feed), AI triage, ATT&CK mapping, ready-to-review patches and WAF rules, STIX/CEF export to their SIEM.

## 3. Four-week plan

| Week | Activities | Exit criterion |
|---|---|---|
| 0 (kick-off) | Sign pilot agreement + DPA. Create tenant, admin user, tech stack, alert channel. Live demo with `Trigger Live Dark Web Attack`. | Champion logged in, alerts reach their channel |
| 1 | Enable NVD + 3–5 public Telegram channels relevant to their region/industry. Tune severity threshold. | First real alert they say is relevant |
| 2 | Connect SIEM (STIX/CEF or webhook). Review AI patches together; collect false positives. | One patch or rule deployed (after their review) |
| 3 | Measure KPIs (below). Feedback call: what would they pay for, what's missing. | KPI sheet filled |
| 4 | Results review with champion + budget owner. Conversion proposal. | Signed order, or written reason why not |

## 4. Success metrics (measure from the platform + one survey)

| KPI | Target | Source |
|---|---|---|
| Relevant alerts / total alerts (analyst-judged) | ≥ 70% | Feedback on each alert |
| Median time from intel publication to remediation plan | < 10 minutes | `ingested_at → analyzed_at`, MTTR tile |
| Patches or rules approved and deployed | ≥ 3 | Patch approvals |
| Analyst hours saved per week (self-reported) | ≥ 4 h | Weekly survey |
| AI cost per tenant per month | Track; must fit the price | Anthropic usage per tenant |
| Champion NPS | ≥ 8 | Final survey |

## 5. Pricing hypothesis to test

| Plan | Price (hypothesis) | Includes |
|---|---|---|
| Starter | $490 / month | 1 tenant, NVD + Telegram, 10 users, Slack/WhatsApp |
| Business | $1,490 / month | + dark-web feed, SIEM export, API keys, SSO |
| Enterprise | from $40k / year | + on-prem, SLA, custom collectors |

Check gross margin against real AI cost per tenant measured in week 3 before quoting.

## 6. Outreach templates

**LinkedIn / email (English)**

> Subject: Dark-web threats targeting {Company}'s stack, triaged in minutes
>
> Hi {Name}, I'm building AegisPulse: it watches CVE feeds, Telegram OSINT and dark-web intel, matches every threat to your actual stack ({e.g. AWS, Nginx, PostgreSQL}), and gives your team a prioritised alert with ATT&CK mapping and a ready-to-review fix, usually within minutes.
>
> We're taking 3–5 design partners for a free 4-week pilot. Could I show you a 15-minute live demo where we simulate an attack on a stack like yours?

**Azərbaycanca (yerli şirkətlər üçün)**

> Salam {Ad}, mən AegisPulse platformasını qururam. Platforma CVE feed-lərini, Telegram OSINT kanallarını və dark web kəşfiyyatını izləyir. Hər təhdidi şirkətinizin real texnologiyalarına ({məs. AWS, Nginx, PostgreSQL}) uyğunlaşdırır və komandanıza bir neçə dəqiqə ərzində prioritetləşdirilmiş alert göndərir: MITRE ATT&CK xəritəsi və yoxlamağa hazır həll addımları ilə birlikdə.
>
> 3–5 şirkəti 4 həftəlik pulsuz pilot proqrama dəvət edirik. Sizin stack-ə bənzər sistemə simulyasiya edilmiş hücumu 15 dəqiqəlik canlı demoda göstərə bilərəmmi?

## 7. Before the first pilot starts (checklist)

- [ ] Real Anthropic API key configured; all 5 simulator scenarios produce sensible output (see README "Not yet verified").
- [ ] Pilot agreement and Data Processing Agreement reviewed by a lawyer (see `docs/legal/data-collection-policy.md`).
- [ ] Production deployment with HTTPS, `AEGIS_SECRET_KEY`, backups, and the dashboard behind TLS.
- [ ] Per-tenant AI cost tracking (Anthropic usage per tenant) set up so pricing is grounded.
- [ ] Incident contact and support channel defined (who answers if AegisPulse itself breaks).
