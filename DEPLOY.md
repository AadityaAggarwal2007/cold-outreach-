# InternReach CRM — VPS Deploy Guide (Hostinger KM4)

## 1. Install Node.js on VPS

```bash
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 20
fnm use 20
node -v   # should print v20.x.x
```

## 2. Install PM2 (process manager)

```bash
npm install -g pm2
```

## 3. Upload the project to VPS

**From your Mac**, zip and upload:
```bash
# On your Mac
cd "/Users/aadityaaggarwal/Desktop/untitled folder 7"
zip -r internreach.zip internreach/ --exclude "internreach/node_modules/*" --exclude "internreach/.next/*"
scp internreach.zip root@YOUR_VPS_IP:/root/
```

**On your VPS:**
```bash
cd /root
unzip internreach.zip
cd internreach
npm install
```

## 4. Set up Codex-oth AI gateway on VPS

```bash
# Login with your ChatGPT account (one-time, browser will open)
npx openai-oauth@latest login

# Start in background
npx openai-oauth@latest --detach --port 10531
```

Verify it's running:
```bash
curl http://localhost:10531/v1/models
```

## 5. Set up your .env on VPS

```bash
nano /root/internreach/.env
```

Fill in:
```env
DATABASE_URL="file:./internreach.db"
GMAIL_USER="you@yourworkspace.com"
GMAIL_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
OPENAI_BASE_URL="http://localhost:10531/v1"
OPENAI_API_KEY="local-proxy"
OPENAI_MODEL="gpt-5.6-sol"
PIXEL_BASE_URL="https://yourdomain.com"
DASHBOARD_PASSWORD="your-strong-password"
JWT_SECRET="run: openssl rand -hex 32"
NODE_ENV="production"
```

## 6. Upload your resume

```bash
# From your Mac
scp /path/to/your/Resume.pdf root@YOUR_VPS_IP:/root/internreach/public/resume.pdf
```

## 7. Run database migration

```bash
cd /root/internreach
npx prisma db push
```

## 8. Build and start with PM2

```bash
cd /root/internreach
npm run build
pm2 start npm --name "internreach" -- start
pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

## 9. Set up Nginx reverse proxy

```bash
apt install nginx -y
nano /etc/nginx/sites-available/internreach
```

Paste:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/internreach /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

## 10. Enable HTTPS (free SSL)

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## 11. Point your domain to VPS

In your domain registrar DNS settings, add:
- `A` record: `@` → `YOUR_VPS_IP`
- `A` record: `www` → `YOUR_VPS_IP`

Wait ~5 minutes for DNS propagation, then visit `https://yourdomain.com`.

---

## First-time Setup in the Dashboard

1. **Login** with `DASHBOARD_PASSWORD` from your .env
2. **Settings** → enter Gmail credentials, VPS domain, confirm AI URL
3. **Campaigns → Import** → upload `Company_Contacts_Tiered.xlsx` (2,391 contacts)
4. **Campaigns → Templates** → create your initial email + 5 follow-up templates
5. **Campaigns → Queue** → upload your Resume PDF
6. **Dashboard** → press ▶ Resume Campaign to start sending

Campaign will automatically:
- Send 1 email every 60 seconds (900/day limit)
- Follow up at Day 3, 7, 14, 21, 30
- Check inbox every 5 min for replies
- Stop follow-ups to any company that replies
- Draft AI reply and hold for your approval

---

## Useful PM2 Commands

```bash
pm2 logs internreach          # live logs
pm2 restart internreach       # restart after .env changes
pm2 status                    # see if it's running
```
