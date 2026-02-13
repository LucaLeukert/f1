# Public hosting options for testing

This dashboard is a static site and can be tested publicly with **no backend**.

## Option A (recommended): GitHub Pages (stable URL)

1. Push this branch to GitHub.
2. In repository settings, enable **Pages** and set source to **GitHub Actions**.
3. The included workflow `.github/workflows/deploy-pages.yml` deploys the full static app.
4. Public URL will look like:
   - `https://<your-user>.github.io/<repo>/`

### Notes
- Workflow currently triggers on pushes to `work` branch.
- If your branch differs, update `on.push.branches`.

## Option B: Temporary public tunnel (quick test)

Run locally:

```bash
python3 -m http.server 4173
npx localtunnel --port 4173
```

`localtunnel` prints a temporary public URL like `https://<random>.loca.lt`.

This is good for short-lived testing links but not production/stable hosting.
