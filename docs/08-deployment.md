# 08 — Deployment (Web → Vercel)

The Next.js control center (`apps/web`) deploys to Vercel. The mobile app ships
separately via EAS (later). The backend already runs on Supabase.

## What Vercel needs to know

This is a **pnpm + Turborepo monorepo**, so the key setting is the **Root
Directory**. Vercel then treats `apps/web` as a standard Next.js app and installs
the workspace from the repo root automatically.

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** (auto-detected) |
| Root Directory | **`apps/web`** |
| Build Command | *default* (`next build`) |
| Install Command | *default* (Vercel runs `pnpm install` at the workspace root) |
| Node.js Version | 20 (from `.nvmrc` / `engines`) |
| Package Manager | pnpm 9 (from root `packageManager`) |

No `vercel.json` is required with this setup.

## Environment variables (Vercel → Project → Settings → Environment Variables)

Public vars power the app for normal users (anon key + RLS). The **admin panel**
(create accounts / manage roles) additionally needs the **service_role key as a
SERVER-ONLY var** — no `NEXT_PUBLIC_` prefix, so it's never sent to the browser.

```
NEXT_PUBLIC_SUPABASE_URL      = https://ntuckzexanmrhboyesvh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <your anon key>
SUPABASE_SERVICE_ROLE_KEY     = <your service_role key>   # server-only, admin panel
```

> The `SUPABASE_SERVICE_ROLE_KEY` must be added as a **plain** (non-public) Vercel
> Environment Variable. Admin server actions verify the caller is a super_admin
> before using it. If you omit it, the app still runs — only the `/admin` panel's
> account actions are disabled.

Optional (map tuning — safe to omit, sensible defaults apply):

```
NEXT_PUBLIC_MAP_CENTER_LNG = 21.1553
NEXT_PUBLIC_MAP_CENTER_LAT = 42.3706
NEXT_PUBLIC_MAP_ZOOM       = 13
NEXT_PUBLIC_MAPTILER_KEY   = <optional, for MapTiler tiles>
```

Set these for **Production** (and Preview if you want branch deploys to work).

## Steps

1. Go to **vercel.com**, sign in with **GitHub**.
2. **Add New… → Project** → import **`jonislami/SecureOps`**.
3. Set **Root Directory** to `apps/web`.
4. Add the environment variables above.
5. **Deploy**. First build takes a few minutes.
6. Open the deployment URL → you'll get the **/login** page. Sign in with a
   Supabase user.

## After first deploy

- **Custom domain** (optional): Project → Settings → Domains.
- **Supabase Auth URLs** (optional, only matters for email links / OAuth):
  Supabase → Authentication → URL Configuration → add the Vercel domain to the
  allowed redirect URLs. Password sign-in works without this.
- **Auto-deploys**: every push to `main` redeploys production; pull requests get
  preview URLs.

## Notes

- The site is public but **auth-gated** — middleware redirects anonymous visitors
  to `/login`, and all data is RLS-scoped. Safe to expose.
- The mobile app can point at the same Supabase backend from anywhere; it does not
  depend on the Vercel deployment.
