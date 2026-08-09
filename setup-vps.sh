#!/bin/bash
# InternReach CRM — VPS Setup Script
# Run this in your VPS web console (Hostinger)
# curl -fsSL https://raw.githubusercontent.com/AadityaAggarwal2007/cold-outreach-/main/setup-vps.sh | bash

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  InternReach CRM — VPS Setup"
echo "  Port: 4001  |  Domain: cdnassets.store"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── 1. Install Node 20 if not present ───────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  echo "[1/8] Installing Node.js 20..."
  curl -fsSL https://fnm.vercel.app/install | bash
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
  fnm install 20
  fnm use 20
  fnm default 20
  # Add to bashrc
  echo 'export PATH="$HOME/.local/share/fnm:$PATH"' >> ~/.bashrc
  echo 'eval "$(fnm env)"' >> ~/.bashrc
else
  echo "[1/8] Node $(node -v) already installed ✓"
fi

# ─── 2. Install PM2 ──────────────────────────────────────────────────────────
echo "[2/8] Installing PM2..."
npm install -g pm2 --silent

# ─── 3. Clone repo into /root/cold-outreach (isolated from other projects) ──
echo "[3/8] Cloning InternReach..."
rm -rf /root/cold-outreach
git clone https://github.com/AadityaAggarwal2007/cold-outreach-.git /root/cold-outreach
cd /root/cold-outreach

# ─── 4. Install dependencies ─────────────────────────────────────────────────
echo "[4/8] Installing dependencies..."
npm install --silent

# ─── 5. Create .env ──────────────────────────────────────────────────────────
echo "[5/8] Creating .env (YOU MUST EDIT THIS)..."
cat > .env << 'ENVEOF'
# ═══════════════════════════════════════════
# InternReach CRM — Environment Config
# Edit this file before starting!
# ═══════════════════════════════════════════

NODE_ENV=production
PORT=4001

# Gmail / Google Workspace
GMAIL_USER=you@yourworkspace.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Pixel tracking (your new domain)
PIXEL_BASE_URL=https://cdnassets.store

# Codex-oth AI gateway (runs locally on VPS)
OPENAI_BASE_URL=http://localhost:10531/v1
OPENAI_API_KEY=local-proxy
OPENAI_MODEL=gpt-5.6-sol

# Database path (isolated from other projects)
DATABASE_PATH=/root/cold-outreach/internreach.db

# Dashboard password — CHANGE THIS
DASHBOARD_PASSWORD=changeme123

# JWT secret — run: openssl rand -hex 32
JWT_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX
ENVEOF

echo ""
echo "  ⚠️  EDIT /root/cold-outreach/.env before continuing!"
echo "  Run: nano /root/cold-outreach/.env"
echo ""

# ─── 6. Generate JWT secret automatically ────────────────────────────────────
JWT=$(openssl rand -hex 32)
sed -i "s/REPLACE_WITH_RANDOM_64_CHAR_HEX/$JWT/" .env
echo "[5/8] JWT secret auto-generated ✓"

# ─── 7. Init database ────────────────────────────────────────────────────────
echo "[6/8] Initialising database..."
npx prisma generate
npx prisma db push

# ─── 8. Build ────────────────────────────────────────────────────────────────
echo "[7/8] Building app..."
npm run build

# ─── 9. Start with PM2 (name: internreach — separate from other projects) ────
echo "[8/8] Starting with PM2..."
pm2 delete internreach 2>/dev/null || true
pm2 start npm --name "internreach" -- start -- --port 4001
pm2 save

# ─── 10. Nginx config ────────────────────────────────────────────────────────
echo ""
echo "[+] Writing Nginx config for cdnassets.store..."
cat > /etc/nginx/sites-available/internreach << 'NGINXEOF'
server {
    listen 80;
    server_name cdnassets.store www.cdnassets.store;

    # Pixel tracking route — served fast, no logging (privacy)
    location /r/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        access_log off;
    }

    # Dashboard and API
    location / {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }
}
NGINXEOF

# Enable site
ln -sf /etc/nginx/sites-available/internreach /etc/nginx/sites-enabled/internreach

# Test and reload Nginx
nginx -t && systemctl reload nginx

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ InternReach is LIVE on port 4001"
echo ""
echo "  Next steps:"
echo "  1. Edit: nano /root/cold-outreach/.env"
echo "     → Set GMAIL_USER, GMAIL_APP_PASSWORD, DASHBOARD_PASSWORD"
echo "  2. Upload resume:"
echo "     scp Resume.pdf root@YOUR_IP:/root/cold-outreach/public/resume.pdf"
echo "  3. Start Codex gateway:"
echo "     npx openai-oauth@latest --detach --port 10531"
echo "  4. Enable HTTPS:"
echo "     certbot --nginx -d cdnassets.store -d www.cdnassets.store"
echo "  5. Visit: https://cdnassets.store"
echo ""
echo "  PM2 commands:"
echo "    pm2 logs internreach     # live logs"
echo "    pm2 restart internreach  # after .env changes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
