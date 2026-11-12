# Muriels Creative Corner — GitHub-backed admin starter

This package adapts the supplied storefront and extracts its 52 existing product cards into `products.json`.

## Files

- `index.html` — existing storefront design, with a dynamic product grid.
- `products.json` — migrated product catalogue.
- `categories.json` — existing categories.
- `config.js` — public Cloudflare Worker URL setting.
- `admin.html` / `admin.js` — private product and category dashboard.
- `worker/index.js` — Cloudflare Worker API.
- `worker/wrangler.toml` — Worker deployment configuration.

## Before deployment

1. Put these files and the existing image assets (for example `doll2.webp`, `background.webp`, `bouquet.webp`, and the other product image files) in the root of the GitHub Pages repository. Keep the image filenames/paths intact.
2. Review `products.json`. The old storefront had products whose displayed price was `pending`; those are migrated with `price: null`, so the public site displays **Price on request**. No price has been invented.
3. Legacy products had between one and four images. The migration keeps the first three and repeats the last image for records with fewer than three, to meet the new three-image structure. Review any product that originally had four images if you want a different third image.
4. Update `worker/wrangler.toml` with your GitHub username, repository name, branch, and exact public GitHub Pages origin. For a project site, the origin is still `https://USERNAME.github.io` (not the repository subpath).
5. Set `API_BASE_URL` in the root `config.js` to your deployed Worker URL.

## Deploy the Worker

Install Node.js and Wrangler, then from the `worker` folder:

```bash
npm install -g wrangler
wrangler login
wrangler secret put GITHUB_TOKEN
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
wrangler deploy
```

Use a GitHub fine-grained personal access token restricted to this repository with **Contents: Read and write** permission. Do not put the token in the repository or frontend.

For `SESSION_SECRET`, generate a long random secret (at least 32 random bytes). Store it only as a Worker secret.

The Worker reads these non-secret variables from `wrangler.toml`:
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `ADMIN_USERNAME`
- `ALLOWED_ORIGIN`

`GITHUB_TOKEN`, `ADMIN_PASSWORD`, and `SESSION_SECRET` are secrets configured with `wrangler secret put`.

## Deploy GitHub Pages

Commit and push the root website files and image assets to the configured branch. In GitHub, open **Settings → Pages** and select the branch/folder used by your site. Wait for Pages to publish.

## Important deployment notes

- The Worker API uses an HttpOnly, Secure, SameSite=None cookie because the API and GitHub Pages are on different origins. The browser must allow third-party cookies for this site. If browser privacy settings block them, put the Worker behind a same-site custom domain or use a same-origin proxy.
- GitHub Pages publishing is not instantaneous. A successful dashboard save means the GitHub commit succeeded; it does not guarantee that Pages has finished deploying. The storefront loads the JSON file with cache-busting.
- The Worker checks the latest GitHub file SHA before each write. GitHub still rejects conflicting simultaneous writes; retry after refreshing the dashboard.
- The included Worker does not provide a durable, distributed login rate limiter. Add Cloudflare rate limiting/WAF rules before public production use.
- The image URL validator allows HTTPS URLs and simple relative asset paths. New dashboard submissions should use publicly accessible HTTPS image URLs.
- The public catalogue is intentionally readable by everyone; only writes are protected.

## Test checklist

- [ ] Public storefront loads all migrated products.
- [ ] Search, category filters, and price filters work.
- [ ] Product modal shows title, price, description, and slideshow.
- [ ] WhatsApp product enquiry and custom-order form work.
- [ ] Login succeeds with the server-configured username/password.
- [ ] Incorrect credentials are rejected.
- [ ] Logged-out users cannot read admin API data or write catalogue files.
- [ ] Add, edit, and delete product operations commit to GitHub.
- [ ] All three image previews load before save.
- [ ] Add, rename, and delete category operations work.
- [ ] A category assigned to products cannot be deleted.
- [ ] Verify the public site after GitHub Pages deployment completes.
