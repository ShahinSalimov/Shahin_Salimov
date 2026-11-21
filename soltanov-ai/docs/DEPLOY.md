# Deploy — 3 günlük test linki (Render.com)

## Bir kliklə (Blueprint)

1. console.anthropic.com → **Billing** balansı artırın → **API Keys** → açar yaradın.
2. render.com → GitHub ilə daxil olun → **New → Blueprint** → `Shahin_Salimov` reposu.
3. Render reponun kökündəki `render.yaml`-ı oxuyur və bu dəyərləri soruşur:
   - `ANTHROPIC_API_KEY` — məcburi
   - `OWNER_CONTACT_URL` — `https://wa.me/994XXXXXXXXX`
   - `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` — opsional, boş qala bilər
4. **Apply**. `SESSION_SECRET` və `ADMIN_TOKEN` avtomatik yaranır, disk (`/var/data`) qoşulur, sayt ünvanı avtomatik götürülür.
5. Servis → **Environment** → `ADMIN_TOKEN` dəyərini kopyalayın (admin parolunuz).

## Yoxlama

1. `https://<servis>.onrender.com/api/health` → `"ai":true` görünməlidir.
2. `/admin` → `ADMIN_TOKEN` ilə daxil olun.
3. Əvvəl özünüz üçün "Test" linki yaradıb telefonda yoxlayın: profil, ideyalar, "Səslə istə", reklam ssenarisi.
4. Sonra "Şükran Soltanov" linki yaradın → "Mesajı kopyala" → WhatsApp.

Qeyd: sayğac link ilk dəfə açılanda başlayır, bir linki maksimum 2 cihaz aça bilər. Şükranın linkini əvvəlcədən açmayın.

## Tam versiya (satışdan sonra)

Eyni addımlar, yalnız `EDITION=full`. `/admin` → **Açar yarat** → açarı müştəriyə verin.

## Tam versiya — xərclər birbaşa müştərinin kartından

1. Render-də yeni **Workspace** yaradın (məs. "Soltanov") → **Billing** bölməsinə Şükranın kartını əlavə edin.
2. Həmin workspace-də **New → Blueprint** → bu repo → **Blueprint Path**: `render-full.yaml`.
3. `ANTHROPIC_API_KEY`: Şükranın öz Anthropic hesabından (onun kartı, **Auto-reload** açıq, **Limits**-də aylıq limit).
4. `/admin` → **Açar yarat** → lisenziya açarını Şükrana verin.

Nəticə: server və AI xərcləri hər ay avtomatik onun kartından çıxılır, texniki idarə sizdə qalır.
