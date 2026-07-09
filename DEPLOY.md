# Ставање на веб (Deployment)

The app is a self-contained Node.js server (no external dependencies) plus a JSON
database. Everything needed to deploy lives in this `app/` folder. **You deploy the
`app/` folder** — the spreadsheet and design mockups in the parent project are not
needed and shouldn't be published.

The client-facing calculator works **immediately with zero setup**: the seed database
already contains all ~205 materials with the exact pricing from the Excel, so a fresh
deploy is a fully functional demo out of the box.

---

## ✅ Recommended for a free client demo — Render

Render's **free** web service is the simplest way to get a shareable URL. Good to know
before you start:

- It **sleeps after ~15 min** of no traffic; the next visit takes ~50s to wake up.
  → Tip: open the link yourself a minute before showing the client.
- Free storage is **ephemeral**: admin edits and saved quotes reset on redeploy/sleep.
  That's fine for a demo because the calculator always loads the correct seed pricing.
  (If you later want edits/quotes to persist, see "Making it permanent" below.)

### Steps

1. **Put the `app/` folder in a GitHub repo** (make it **Private** — the pricing lives here):
   ```bash
   cd app
   git init && git add -A && git commit -m "MDA calculator"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Go to **render.com** → sign up (free, can use your GitHub) → **New → Web Service**.
3. **Connect the repo** you just pushed. Render authorizes private repos too.
4. Fill the settings:
   - **Root Directory:** *(leave blank — the repo root is already `app`)*
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
   - **Health Check Path:** `/healthz`
5. Under **Environment**, add a variable:
   - `MDA_ADMIN_PASSWORD` = a password of your choice (this is your admin login).
6. **Create Web Service.** In ~1 minute you get a URL like
   `https://mda-calculator.onrender.com` — share that with the client.
   The admin panel is at `…onrender.com/admin.html`.

> The included `render.yaml` can do steps 4–5 automatically (Render → New → Blueprint),
> but the manual steps above are the most reliable.

---

## Environment variables (all hosts)

| Variable | Purpose | Example |
|---|---|---|
| `PORT` | Port to listen on. Most hosts set this automatically. | `3000` |
| `MDA_ADMIN_PASSWORD` | Your admin password. Without it the default `admin123` is used (a warning is logged). | `a-strong-password` |
| `MDA_DB_FILE` | Where the JSON database is stored. Point at a persistent disk to keep data. | `/data/db.json` |

---

## Railway (railway.com)

The repo already contains everything Railway needs: a `Dockerfile` and a `railway.json`
(builder + healthcheck at `/healthz` + restart policy). **No code changes are required** —
the server already listens on Railway's injected `PORT` on `0.0.0.0`.

Steps:

1. **Push the `app/` folder to GitHub** (private repo — the pricing lives here):
   ```bash
   cd app
   git init && git add -A && git commit -m "MDA calculator"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. On **railway.com** → **New Project → Deploy from GitHub repo** → pick the repo.
   Railway detects the Dockerfile and builds it automatically.
   *(If you pushed the whole project instead of just `app/`, open the service’s
   **Settings → Root Directory** and set it to `app`.)*
3. **Add a Volume** (service → **Variables/Settings → Volumes → New Volume**) with
   **mount path `/data`**. This is what makes admin edits and saved quotes survive
   restarts and redeploys. `MDA_DB_FILE` is already set to `/data/db.json` in the Dockerfile.
4. **Add a variable**: `MDA_ADMIN_PASSWORD` = a strong password (your admin login).
   You do **not** need to set `PORT` — Railway injects it.
5. Deploy. Under **Settings → Networking → Generate Domain** to get a public URL like
   `https://mda-calculator-production.up.railway.app`. Admin panel is at `…/admin.html`.

Notes:
- Railway isn’t free long-term — new accounts get trial credit (fine for a client demo),
  then it’s the Hobby plan (a few $/month), which also unlocks the persistent volume.
- If you skip the volume, the site still works perfectly (calculator always loads correct
  seed pricing), but admin edits/quotes reset on each redeploy.

## Other permanent hosts (data survives restarts)

Any host with a **persistent volume** mounted at `/data` works with the same `Dockerfile`:

- **Fly.io** — free small volume, stays awake. More command-line driven (`flyctl launch`).
- **Render paid tier** — a paid instance + an attached Disk at `/data`.

### Test the container locally
```bash
cd app
docker build -t mda .
docker run -p 3000:3000 -e MDA_ADMIN_PASSWORD=test123 -v mda_data:/data mda
# open http://localhost:3000  and  http://localhost:3000/admin.html
```

### VPS with PM2 (your own server)
```bash
cd app
MDA_ADMIN_PASSWORD='strong-pass' MDA_DB_FILE=/var/lib/mda/db.json \
  pm2 start server.js --name mda
pm2 save && pm2 startup
```
Put Nginx or Caddy in front for HTTPS.

---

## Custom domain (later)

Point a subdomain like `calculator.modulardesignarchitects.com` (a CNAME to the host's
URL) so it sits next to the existing site. Every host above has a one-screen "custom
domain" setting that shows the exact DNS record to add.

## Backup / reset

- **Backup:** download `db.json` from the volume (it's the whole database).
- **Reset to factory pricing:** delete `db.json` and restart.
