# Deploying to Hostinger VPS (Node.js)

> **Important:** This app is a full-stack server-rendered app. Hostinger's
> shared/Premium/Business *web hosting* plans cannot run it — they only serve
> static files, which is why the site showed **403 Forbidden** (no `index.html`
> exists; HTML is rendered by the server). You need a **Hostinger VPS (KVM)**
> where you can run Node.js. Alternatively, use Cloudflare Workers per
> `DEPLOYMENT.md` and point your domain there.

## 1. Server setup (once)

```bash
# On the VPS (Ubuntu):
curl -fsSL https://bun.sh/install | bash      # or use Node 20+ with npm
sudo apt update && sudo apt install -y git
npm i -g pm2                                   # process manager
```

## 2. Get the code

```bash
git clone https://github.com/Harshitraj4767-byte/migration-helper.git
cd migration-helper
```

## 3. Configure environment

The Supabase URL and publishable key are **baked in at build time**, so they
must be set before building:

```bash
export SB_URL="https://cupvxfoikjkufudgehsr.supabase.co"
export SB_PUBLISHABLE_KEY="<publishable key>"
```

Runtime secrets (service role key, CRON_SECRET, etc.) should go in a `.env`-style
shell file or `pm2` ecosystem config — never commit them.

## 4. Build and run

```bash
bun install
bun run build:node        # builds with the Node server preset into dist/
PORT=3000 pm2 start dist/server/index.mjs --name neet-buddy
pm2 save && pm2 startup   # auto-restart on reboot
```

## 5. Point the domain (reverse proxy)

With Apache (default on Hostinger VPS images):

```apache
<VirtualHost *:80>
  ServerName yourdomain.com
  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

```bash
sudo a2enmod proxy proxy_http && sudo systemctl reload apache2
sudo certbot --apache -d yourdomain.com    # free HTTPS
```

Or with Nginx:

```nginx
server {
  listen 80;
  server_name yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 6. Updating the site later

```bash
cd migration-helper
git pull
bun install
bun run build:node
pm2 restart neet-buddy
```
