# Zero-Touch Rəqəmsal Biznes Ekosistemi — Texniki Sənəd

Stek: Python 3.12 + Flask, Replit (Reserved VM Deployment), Gumroad API, YouTube Data/Analytics API, WhatsApp bildirişləri, LLM olaraq Claude API.

| Fayl | Məzmun |
|------|--------|
| [01-agent-system-prompts.md](01-agent-system-prompts.md) | 10 agentin System Prompt-u, input və JSON output sxemi |
| [02-orchestration-architecture.md](02-orchestration-architecture.md) | JSON mesaj protokolu, orkestrasiya dövrəsi, Python kod skeleti |
| [03-prd-claude-code.md](03-prd-claude-code.md) | Claude Code ilə sıfırdan qurmaq üçün PRD, qovluq strukturu, addım-addım tapşırıqlar |

## Ümumi mənzərə

```
                 ┌──────────────────────────── ORG A: studio (Gumroad) ───────────────────────────┐
 cron 06:00 ──►  │ CEO ─► Research ─► CEO(seçim) ─► Content ─► Philosopher ─► Banker ─► publish  │ ─► WhatsApp
 Gumroad ping ─► │                                  ▲ revizyon (max 2) ┘                          │
                 └─────────────────────────────────────────────────────────────────────────────────┘

                 ┌──────────────────────────── ORG B: youtube (ayrı Repl) ─────────────────────────┐
 cron 08:00 ──►  │ Trend Scout ─► Script Writer ─► Media Producer ─► SEO & Upload ─► Growth Banker │ ─► WhatsApp
                 └─────────────────────────────────────────────────────────────────────────────────┘
```

İzolyasiya prinsipi: iki təşkilat **eyni kod bazasından** (`core/` paketi) istifadə edir, amma **ayrı Replit layihəsində, ayrı Secrets, ayrı SQLite/Postgres bazası, ayrı WhatsApp mövzu prefiksi** ilə işləyir. Bir-birinin bazasına, açarına və növbəsinə çıxışı yoxdur.

## Əvvəlcədən bilməli olduğun real məhdudiyyətlər

Bunları uydurma etməmək üçün açıq yazıram. Hər biri PRD-də ayrıca risk kimi işlənib.

1. **Gumroad API ilə məhsul yaratmaq.** Gumroad-un rəsmi API v2 sənədlərində məhsulları oxumaq, `enable`/`disable`, silmək, `offer_codes`, `sales`, `resource_subscriptions` (ping) var. **Yeni məhsul yaratmaq (`POST /products`) sənədlərdə rəsmi olaraq yox idi** — son vəziyyəti dəqiq bilmirəm. Qurmadan əvvəl `https://app.gumroad.com/api` səhifəsində yoxla. Yoxdursa, plan B: Playwright ilə Gumroad dashboard-da məhsul yaratma (PRD-də `GumroadPublisher` interfeysi hər iki variantı dəstəkləyir) və ya "draft hazırla + WhatsApp-a bir kliklə təsdiq linki" yarı-avtomat rejimi.
2. **YouTube upload.** Google tərəfindən audit olunmamış API layihəsindən yüklənən videolar avtomatik **private** qalır. Public yükləmə üçün YouTube API Services audit formunu doldurmaq lazımdır. Gündəlik kvota default 10 000 unitdir, upload bahalı əməliyyatdır — gündə bir neçə video limitini nəzərə al.
3. **YouTube monetizasiya siyasəti.** Kütləvi, təkrarlanan, "inauthentic" AI məzmunu YPP-dən kənarlaşdırıla bilər. Ona görə Script Writer və Media Producer prompt-larında unikallıq, orijinal dəyər və insan-səviyyəli redaktə qaydaları məcburidir; AI-generated realistik məzmun üçün YouTube-un "altered or synthetic content" bildirişi aktiv edilməlidir.
4. **WhatsApp.** Meta WhatsApp Cloud API-də biznes tərəfindən başladılan mesaj (24 saatlıq pəncərədən kənar) yalnız **təsdiqlənmiş template** ilə göndərilir. Sadə yol: Twilio WhatsApp və ya Cloud API + `daily_report` template.
5. **"Zero-touch" ≠ nəzarətsiz.** Pul, publikasiya və hüquqi risk olan addımlarda avtomatik "kill switch", büdcə limiti və Philosopher qapısı (quality gate) var. İnsan heç nəyə toxunmur, amma sistem öz-özünü dayandıra bilir.
