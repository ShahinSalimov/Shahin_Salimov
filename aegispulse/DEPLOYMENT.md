# Production Deployment Guide

Deploy AegisPulse to a single Linux VPS (DigitalOcean Droplet, Hetzner Cloud, or any Ubuntu server) with Docker, Nginx, free Let's Encrypt TLS and your own domain.

End result:

| URL | Serves |
|---|---|
| `https://app.<your-domain>` | SOC dashboard (login required) |
| `https://api.<your-domain>` | REST API for SIEM/SOAR integrations and tenant API keys |

Time required: about 45 minutes. Every command below was written for **Ubuntu 24.04 LTS**.

---

## 1. Server requirements

| Resource | Minimum | Recommended | Why |
|---|---|---|---|
| CPU | 2 vCPU | 4 vCPU | API, worker, collector, Next.js and Postgres share the host |
| RAM | 4 GB | 8 GB | The frontend image build alone needs ~2 GB |
| Disk | 40 GB SSD | 80 GB SSD | Docker images, database, local backups |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS | |

Create the server in your provider's console, add **your SSH key** during creation (never use password login), and note the public IPv4 (and IPv6 if offered) address.

## 2. Point your domain at the server

At your domain registrar (any registrar that sells `.ai` / `.io` works), create these DNS records:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `app` | server IPv4 | 300 |
| A | `api` | server IPv4 | 300 |
| AAAA | `app` | server IPv6 (if you have one) | 300 |
| AAAA | `api` | server IPv6 (if you have one) | 300 |

Check propagation from your laptop before continuing (both must print the server IP):

```bash
dig +short app.yourdomain.ai
dig +short api.yourdomain.ai
```

## 3. Harden the server

SSH in as root once, create a deploy user, and lock things down:

```bash
ssh root@SERVER_IP

adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy && chmod 440 /etc/sudoers.d/deploy

# SSH: keys only, no root login
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall: only SSH and HTTP(S) from the internet
apt-get update && apt-get install -y ufw fail2ban unattended-upgrades
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades
```

From now on, connect as `deploy`: `ssh deploy@SERVER_IP`.

On a 4 GB server, add swap so the frontend build cannot run out of memory:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Install Docker Engine and Nginx

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git nginx
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy
```

Log out and back in (so the `docker` group applies), then confirm:

```bash
docker compose version
```

## 5. Get the code

The repository is private, so give the server a **read-only deploy key**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/aegispulse_deploy -N "" -C "aegispulse-server"
cat ~/.ssh/aegispulse_deploy.pub
```

In GitHub: repository **Settings → Deploy keys → Add deploy key**, paste the key, leave "Allow write access" **unchecked**. Then:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-aegispulse
  HostName github.com
  User git
  IdentityFile ~/.ssh/aegispulse_deploy
  IdentitiesOnly yes
EOF

sudo mkdir -p /opt/aegispulse-src && sudo chown deploy:deploy /opt/aegispulse-src
git clone git@github-aegispulse:ShahinSalimov/Shahin_Salimov.git /opt/aegispulse-src
sudo ln -sfn /opt/aegispulse-src/aegispulse /opt/aegispulse
cd /opt/aegispulse
```

## 6. Configure the environment

```bash
cd /opt/aegispulse
cp .env.example .env
chmod 600 .env
DOMAIN=yourdomain.ai

# Generate secrets and set production values in one go
sed -i \
  -e "s|^AEGIS_ENV=.*|AEGIS_ENV=production|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^AEGIS_SECRET_KEY=.*|AEGIS_SECRET_KEY=$(openssl rand -hex 32)|" \
  -e "s|^AEGIS_CORS_ORIGINS=.*|AEGIS_CORS_ORIGINS=https://app.$DOMAIN|" \
  -e "s|^AEGIS_DASHBOARD_URL=.*|AEGIS_DASHBOARD_URL=https://app.$DOMAIN|" \
  -e "s|^BIND_ADDRESS=.*|BIND_ADDRESS=127.0.0.1|" \
  .env
nano .env
```

In `nano`, set these by hand:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com |
| `AEGIS_BOOTSTRAP_ADMIN_EMAIL` | Your real email (first admin login) |
| `AEGIS_BOOTSTRAP_ADMIN_PASSWORD` | A strong password, 12+ characters |
| `AEGIS_COLLECTORS` | `nvd` to start; add `telegram` after setting `TELEGRAM_CHANNELS` |
| `AEGIS_RAW_TEXT_RETENTION_DAYS` | The value your legal policy sets (default 90) |
| `SLACK_WEBHOOK_URL` / `TWILIO_*` | Optional alert channels |

`BIND_ADDRESS=127.0.0.1` is essential: it keeps ports 3000 and 8000 reachable **only by Nginx on the same host**. Docker-published ports bypass `ufw`, so without it the app would be exposed without TLS.

## 7. Start the stack

```bash
cd /opt/aegispulse
docker compose up -d --build
docker compose ps
```

The first build takes 5–10 minutes. On start the backend runs database migrations, seeds the bootstrap admin, then serves traffic. All services should show `Up` (and `healthy` where a health check exists). Verify locally:

```bash
curl -s http://127.0.0.1:8000/health
# {"status":"ok","database":true,"queue":"redis","ai_engine_configured":true,...}
```

## 8. Configure Nginx

```bash
DOMAIN=yourdomain.ai
sudo cp /opt/aegispulse/deploy/nginx/aegispulse-proxy.conf /etc/nginx/snippets/aegispulse-proxy.conf
sudo sed "s/aegispulse.example/$DOMAIN/g" /opt/aegispulse/deploy/nginx/aegispulse.conf \
  | sudo tee /etc/nginx/sites-available/aegispulse.conf > /dev/null
sudo ln -sfn /etc/nginx/sites-available/aegispulse.conf /etc/nginx/sites-enabled/aegispulse.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

The configuration (`deploy/nginx/aegispulse.conf`) already handles:
- Server-Sent Events for the live dashboard (buffering off, 1-hour read timeout);
- an extra login rate limit at the edge (20/min per IP) on top of the application's own limits;
- an `X-Forwarded-For` value the client cannot forge, which the app uses for rate limiting and the audit log.

## 9. Enable HTTPS with Let's Encrypt

```bash
DOMAIN=yourdomain.ai
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.$DOMAIN -d api.$DOMAIN \
  --redirect --hsts --agree-tos --no-eff-email -m you@$DOMAIN
sudo systemctl status certbot.timer --no-pager   # auto-renewal is scheduled
sudo certbot renew --dry-run
```

Certbot rewrites the Nginx config to listen on 443, redirects HTTP to HTTPS, and adds HSTS. Because Nginx now sends `X-Forwarded-Proto: https`, the dashboard's session cookie is automatically marked `Secure`.

## 10. First login and hardening of the account

1. Open `https://app.yourdomain.ai`. You are redirected to **/login**.
2. Sign in with the bootstrap admin email and password.
3. **Team → Users**: add your analysts. **Team → API keys**: create keys for SIEM forwarders.
4. Remove the bootstrap password from the server now that the admin exists:
   ```bash
   cd /opt/aegispulse
   sed -i 's/^AEGIS_BOOTSTRAP_ADMIN_PASSWORD=.*/AEGIS_BOOTSTRAP_ADMIN_PASSWORD=/' .env
   docker compose up -d
   ```
5. Click **Trigger Live Dark Web Attack** to confirm the three agents run end to end with your real Anthropic key.

## 11. Backups

```bash
sudo mkdir -p /var/backups/aegispulse && sudo chown deploy:deploy /var/backups/aegispulse
sudo touch /var/log/aegispulse-backup.log && sudo chown deploy:deploy /var/log/aegispulse-backup.log
/opt/aegispulse/deploy/backup.sh          # run once now, must print "backup ok"
( crontab -l 2>/dev/null; echo "0 3 * * * /opt/aegispulse/deploy/backup.sh >> /var/log/aegispulse-backup.log 2>&1" ) | crontab -
```

The script keeps 14 days of compressed dumps and verifies each one contains the core tables. Copy the backups off the server as well (provider snapshots, or `rclone` to object storage); a backup on the same disk does not survive losing the server. **Test a restore** once a month:

```bash
gunzip -c /var/backups/aegispulse/aegispulse-YYYYMMDDTHHMMSSZ.sql.gz \
  | docker compose -f /opt/aegispulse/docker-compose.yml exec -T db psql -U aegis -d aegispulse
```

## 12. Updates

```bash
cd /opt/aegispulse-src && git pull
cd /opt/aegispulse && docker compose up -d --build
docker compose ps
```

Migrations run automatically on backend start. Take a backup before every update (`deploy/backup.sh`).

## 13. Monitoring

| What | How |
|---|---|
| Uptime | External monitor (UptimeRobot, Better Stack, etc.) on `https://api.yourdomain.ai/health`, alert if not HTTP 200 |
| Logs | `docker compose logs -f backend worker collector` (structured JSON, ready for any log shipper) |
| Collector health | Dashboard → **Sources** (last run, errors, items ingested) |
| Security events | Dashboard → **Team → Audit log** |
| AI spend | Anthropic console usage page; per-run caps via `AEGIS_COLLECTOR_MAX_ITEMS_PER_RUN` |
| Disk | `df -h /` and `docker system df`; prune old images with `docker image prune -f` after updates |

## 14. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `502 Bad Gateway` from Nginx | Containers not up yet or crashed | `docker compose ps`, `docker compose logs backend frontend` |
| Backend restarts with `AEGIS_SECRET_KEY must be set` | `.env` missing the key | Step 6 |
| Login returns "Rate limit exceeded" | Too many attempts from one IP or for one email | Wait 60 seconds; limits are `AEGIS_LOGIN_RATE_LIMIT_PER_MINUTE` and the Nginx `aegis_login` zone |
| Dashboard shows "polling" instead of "live stream" | SSE buffered by a proxy/CDN in front of Nginx | Disable buffering for `/api/backend/stream` at the CDN |
| Threats stay `failed` with "AI engine not configured" | `ANTHROPIC_API_KEY` empty | Set it in `.env`, `docker compose up -d` |
| Collector shows `request failed (ConnectError)` | Outbound HTTPS blocked by provider firewall | Allow egress 443 |
| Frontend build killed (exit 137) | Out of memory | Add swap (step 3) or use 8 GB RAM |
| `certbot` fails the challenge | DNS not propagated or port 80 closed | Re-check step 2 and `ufw status` |
