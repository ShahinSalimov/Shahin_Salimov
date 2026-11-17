# Security Self-Assessment & Penetration-Test Scope

This is an internal assessment written by the engineering team. It is **not a substitute for an independent penetration test**. Its purpose is to give the external testers an accurate map, and to give buyers' due-diligence teams evidence of what has been verified so far.

## 1. Automated checks (re-run in CI on every push: `.github/workflows/aegispulse-ci.yml`)

| Check | Tool | Result (2026-11-17) |
|---|---|---|
| Python dependency CVEs | `pip-audit -r backend/requirements.txt --strict` | No known vulnerabilities |
| JS production dependency CVEs | `npm audit --omit=dev` | 0 vulnerabilities (PostCSS advisories fixed by pinning + `overrides`) |
| Python static security lint | `ruff --select S` (bandit rules) | Only `assert` usage and `random.choice` in the demo simulator; neither is a security issue |
| Unsafe HTML rendering | grep `dangerouslySetInnerHTML` | Not used; AI output is rendered as React text nodes |
| Dynamic code execution | grep `eval`/`exec` | None. The only subprocess is `bash -n` (parse-only) on generated scripts |
| Test suite incl. security tests | `pytest` | 112 passing (auth, tenant isolation, injection, SSRF, rate limits, audit) |

## 2. Threat model (STRIDE, by component)

| Component | Threat | Mitigation in code | Test |
|---|---|---|---|
| API auth | **S**poofed session token | HMAC-SHA256 signed tokens, constant-time compare, expiry, user re-validated per request | `test_auth.py::test_token_signature_and_expiry`, `test_bad_bearer_token_rejected` |
| API auth | Credential stuffing / brute force | Login rate limit per IP **and** per email; uniform error messages; scrypt hashing | `test_login_failures_are_uniform_and_rate_limited` |
| API auth | IP spoofing to bypass rate limits | `X-Forwarded-For` trusted only from private networks (`FORWARDED_ALLOW_IPS`) | Config review |
| Multi-tenancy | **I**nformation disclosure across tenants | Every query scoped by `company_id`; cross-tenant IDs return 404 | `test_tenant_isolation` (mutation-tested) |
| Roles | **E**levation of privilege | Role guard on every mutating route; admins can't demote themselves; tenant admins can't create tenants | `test_roles_enforced`, `test_user_admin_guards_and_deactivation` |
| AI pipeline | **T**ampering via prompt injection in collected intel | Unicode/control stripping, injection signals, nonce envelope, schema-constrained outputs, IoC grounding, read-only tools, forced human review | `test_pipeline.py::test_prompt_injection_is_flagged_and_forces_review` |
| AI output | Malicious generated script | Never executed; `bash -n`/AST/JSON validation; destructive-pattern risk scoring; human approval | `test_remediation_validation.py` |
| Dispatcher | SSRF via webhook URLs | HTTPS-only, private/loopback/link-local IPs rejected, Slack host pinned | `test_dispatcher.py::test_ssrf_guard` |
| Webhook | Spoofed alerts at the receiver | HMAC-SHA256 signature with timestamp | `test_dispatch_sends_slack_whatsapp_and_signed_webhook` |
| Dashboard | Session theft via XSS | httpOnly + SameSite=Strict cookie; token never reaches page JS; React escaping | Code review |
| Dashboard | CSRF | SameSite=Strict cookie; proxy requires JSON body | Code review |
| Proxy | Path traversal / API surface expansion | Allowlisted path prefixes, `..` rejected, 64 KB body cap | Manual curl test |
| All | **R**epudiation | Append-only audit trail with actor, IP and target | `test_audit.py` |
| API | **D**enial of service / AI cost exhaustion | Per-principal rate limits, separate expensive bucket, collector volume caps | `test_expensive_endpoints_are_rate_limited` |

## 3. Known gaps (residual risk, honest list)

| Gap | Risk | Planned fix |
|---|---|---|
| No MFA / SSO (SAML/OIDC) for dashboard users | Account takeover via phished password | Add OIDC (Okta / Azure AD / Google) before enterprise sales |
| No forced password rotation or breached-password check | Weak reuse | Add HIBP k-anonymity check on set/change |
| Secrets are plain environment variables | Host compromise exposes keys | Move to a secrets manager (AWS Secrets Manager / Vault) |
| No encryption at the application layer for `raw_text` | DB dump exposes leak content | Rely on disk encryption now; evaluate column encryption |
| Rate limiter falls back to per-process memory without Redis | Limits per replica only | Redis is mandatory in the compose deployment |
| AI analysis quality not yet validated against the live API | Wrong prioritisation | Run evaluation set with real key before pilots |
| No WAF / DDoS protection in front of the dashboard | Volumetric attacks | Deploy behind Cloudflare / AWS WAF |
| Session revocation is per user (deactivate), not per token | Stolen token valid until expiry if user stays active | Add token version / session table |

## 4. Scope for the external penetration test

**Targets:** staging deployment of the dashboard (`https://staging…`) and API (`https://api.staging…`), built from a tagged commit.

**Test accounts provided:** two tenants (A, B). Each has an admin, an analyst and a viewer, plus one analyst API key per tenant. A platform operator key will be supplied for limited, specific tests only.

**Priority test cases:**
1. Tenant isolation: reach tenant A's threats, patches, alerts, exports, users, keys or audit log as tenant B, by ID guessing, parameter tampering (`company_id`) or the SSE stream.
2. Authentication: token forgery or replay, expired-token use, login rate-limit bypass, user enumeration via timing or messages.
3. Authorisation: viewer → analyst/admin escalation; self-role change; API key role escalation.
4. Prompt injection: craft intel that makes an agent (a) emit indicators not in the text, (b) lower severity, (c) produce a dangerous script that passes validation, (d) leak system prompts into the UI or exports.
5. Stored XSS through AI output, IoC values, paste titles or Telegram text rendered in the dashboard, STIX or CEF.
6. SSRF / outbound abuse through webhook configuration and collector URLs.
7. Injection in exports: CEF field and header escaping, STIX pattern escaping.
8. Proxy (`/api/backend/*`): path traversal, header smuggling, body-size bypass.
9. Denial of wallet: drive AI spend via ingest, simulate-attack and re-analyze.

**Out of scope:** third-party services (Anthropic, Twilio, Slack, NVD, Telegram), physical/social engineering, volumetric DDoS.

**Rules of engagement:** testing window agreed in writing; no destructive tests against production data; findings reported with CVSS v3.1 scores; retest of fixed high/critical findings included.

**Deliverables expected from the firm:** report with executive summary, findings with reproduction steps, and a letter of attestation for customer and acquirer due diligence.
