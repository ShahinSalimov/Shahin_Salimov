# CHANGEMESH — Product Overview

**Every change. Every connection. One control center.**

## The problem

A business publishes the same facts in many places: the website, a PDF menu, a price spreadsheet, a product catalog, Google listings, marketing flyers. When one fact changes — a price, opening hours, a phone number, an address — somebody has to remember every place it appears. Usually some copies are missed, and customers see conflicting information.

## What CHANGEMESH does

1. **Collects your business assets.** Websites, PDFs, spreadsheets, catalogs and manually tracked documents are registered in a workspace. CHANGEMESH reads them and extracts the facts they contain (product, attribute, value, and exactly where it was found).
2. **Maps how they are connected.** It suggests relationships between assets that share the same facts ("the PDF menu is derived from the price list"). People confirm or reject each suggestion. The Change Map shows the result as an interactive graph and flags assets that disagree with each other.
3. **Detects and explains changes.** When a fact changes — recorded by a person, found by a re-scan, or sent through the API — CHANGEMESH calculates which other assets are affected, how strongly, and why, and drafts an update proposal for each one. Optional AI-assisted analysis (Claude) is clearly labeled and never replaces the rule-based result without review.
4. **Routes updates for approval.** Admins approve, reject or request a revision. Nothing is applied automatically. Approved updates are applied by a person (with a confirmation note) or exported as update instructions (CSV / Markdown). Every step is recorded in the audit log.

## Who uses it

| Role | Can do |
|---|---|
| Owner | Everything, including deleting the workspace and assigning owners |
| Admin | Approve and apply updates, manage members, invitations, API keys, billing |
| Editor | Add assets, scan, confirm relationships, record changes, revise proposals |
| Viewer | Read everything in the workspace |

Typical customers: restaurant groups and hospitality, multi-location retail, franchises, and agencies that manage information for several clients (one workspace per client).

## Plans (proposed test prices — not validated)

| Plan | Price | Includes |
|---|---|---|
| Starter | $19 / month | 1 workspace, 25 assets, basic scanning, basic change detection |
| Business | $59 / month | 5 workspaces, 250 assets, advanced impact analysis, approval workflows |
| Agency | $149 / month | Multiple client workspaces, 1,000 assets, team collaboration, advanced reporting |
| Enterprise | Custom | Custom limits, advanced permissions, dedicated support, enterprise integrations |

Asset and workspace limits are enforced by the database. Billing runs through Stripe in **test mode** in this release.

## Principles

- **No silent changes.** Every external modification requires approval; integrations that write to external systems are not connected yet, and the product says so.
- **No invented data.** Demo data is fictional and labeled; AI output is labeled and validated; failed scans are shown as failures.
- **Tenant isolation.** Each organization's data is protected by database-level Row Level Security.
- **Everything auditable.** Who changed what, when, and why.

## Current limitations

- Connectors that update websites or third-party systems automatically are on the roadmap; today updates are applied manually and confirmed in CHANGEMESH.
- Invitation emails are not sent automatically yet; admins share the invitation link.
- See [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md) for the full list.
