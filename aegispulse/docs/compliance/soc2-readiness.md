# SOC 2 Readiness (Security Trust Services Criteria)

SOC 2 is an attestation by an independent CPA firm, not something software can "have". This document maps which controls the **product already provides** (with evidence) and which **organisational processes** still need to exist before a Type I audit (controls designed at a point in time) and a Type II audit (controls operating over 3–12 months).

Legend: **Product** = implemented and tested in this repository · **Partial** = partly in place · **Process** = company policy/operation still needed

## Control mapping

| TSC | Control | Status | Evidence / what's missing |
|---|---|---|---|
| CC6.1 | Logical access requires authentication | Product | `backend/security.py` (sessions, API keys); `tests/test_auth.py` |
| CC6.1 | Role-based least privilege | Product | viewer / analyst / admin roles; `test_roles_enforced` |
| CC6.1 | Tenant data segregation | Product | company scoping on every endpoint; `test_tenant_isolation` |
| CC6.1 | MFA for privileged access | **Process / Gap** | No MFA/SSO yet (see security assessment §3) |
| CC6.2 | User provisioning / de-provisioning | Partial | Team drawer + `PATCH /api/users` (immediate session invalidation). Missing: documented joiner/mover/leaver procedure |
| CC6.3 | Periodic access reviews | **Process** | Quarterly export of `/api/users` + `/api/api-keys`, signed off by a manager |
| CC6.6 | Protection against external threats | Partial | Rate limiting, SSRF guards, security headers. Missing: WAF, TLS policy evidence |
| CC6.7 | Encryption in transit | **Process** | Deploy behind TLS (README). Missing: certificate management evidence |
| CC6.8 | Malicious code prevention | Product | AI scripts never executed; dependency audits in CI |
| CC7.1 | Vulnerability management | Partial | `pip-audit`, `npm audit` in CI. Missing: container image scanning, patch SLA policy |
| CC7.2 | Security event monitoring / audit logging | Product | `audit_events` table, `/api/audit-log`, JSON logs. Missing: log shipping to a SIEM + alerting |
| CC7.3–7.5 | Incident response | **Process** | Written IR plan, on-call rota, post-mortem template |
| CC8.1 | Change management | Partial | Git, PR-based changes, CI gates, Alembic migrations. Missing: required PR review / branch protection evidence |
| CC9.2 | Vendor management | **Process** | Sub-processor list exists (`docs/legal/data-collection-policy.md` §4); need vendor risk reviews + DPAs |
| A1.2 | Backups & recovery | **Process** | Postgres backups + restore test evidence (not implemented in compose) |
| C1.1 | Confidential data retention & disposal | Product | `AEGIS_RAW_TEXT_RETENTION_DAYS`, `AEGIS_AUDIT_RETENTION_DAYS`, `test_retention_*` |
| CC1/CC2 | Governance: policies, security awareness training, background checks | **Process** | Information security policy set, annual training records |

## Roadmap

1. **Weeks 0–4: foundations.** Adopt a compliance automation platform (e.g. Vanta, Drata, Secureframe), write the policy set, enable branch protection with required reviews, ship logs to a SIEM, set up automated Postgres backups with a monthly restore test, add MFA/SSO.
2. **Weeks 4–8: Type I.** External pentest (scope in `docs/security/security-assessment.md`), fix high/critical findings, engage a CPA firm for a SOC 2 Type I report.
3. **Months 3–12: Type II.** Operate the controls with evidence collection (access reviews, incident drills, vendor reviews), then the Type II audit window.

Indicative cost to budget (verify with vendors): compliance platform and auditor fees are typically several tens of thousands of USD in the first year, plus the pentest.
