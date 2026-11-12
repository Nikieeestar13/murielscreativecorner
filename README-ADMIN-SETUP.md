# Muriels Creative Corner — Product Admin

## What this adds
- A Login link in the storefront header and a private admin dashboard at `admin.html`.
- Add, edit and delete products; each new/edited product requires a name, category, numeric INR price, description and exactly three working image URLs.
- Add, rename and delete categories. A category cannot be deleted while products still use it; renaming updates its products.
- Product and category data are stored together in `catalog.json`. A successful save commits that file to GitHub and publishes through the existing Pages workflow.
- The storefront reads `catalog.json` and keeps its existing visual design, filters, modal slideshow, WhatsApp enquiry and custom order form.
- Existing 52 products are migrated from the current storefront. Legacy products retain their original slideshow image sets. New products and products saved through the admin require exactly three images. Products historically marked pending retain a blank price label in the storefront; newly created products require a numeric price.

## Deployment — required one-time setup

### 1. GitHub Pages
The repository already has `.github/workflows/static.yml` deploying the repository root to GitHub Pages on pushes to `main`. Confirm Pages is configured to use GitHub Actions. The expected site origin is `https://nikieeestar13.github.io`.

### 2. Create a Cloudflare Worker
Create a Worker named `muriels-creative-corner-admin`. Copy `worker/index.js` into its entry file. Create a KV namespace and bind it as `RATE_LIMIT`; replace the placeholder ID in `worker/wrangler.toml` if deploying with Wrangler.

Set these Worker variables:
- `GITHUB_OWNER`: `Nikieeestar13`
- `GITHUB_REPO`: `murielscreativecorner`
- `GITHUB_BRANCH`: `main`
- `ADMIN_USERNAME`: `muriel`
- `ALLOWED_ORIGIN`: `https://nikieeestar13.github.io`

Add these as Worker **secrets**, never as source code:
- `ADMIN_PASSWORD`: the admin password you chose.
- `SESSION_SECRET`: a long random secret (at least 32 random bytes).
- `GITHUB_TOKEN`: a GitHub fine-grained personal access token scoped only to this repository with **Contents: Read and write** permission.

The Worker also needs a KV namespace binding named `RATE_LIMIT` for login throttling. The admin session is a signed, two-hour bearer token held in sessionStorage. GitHub credentials and the password remain server-side.

### 3. Point the admin page to the Worker
After deploying, copy the Worker URL (for example, `https://muriels-creative-corner-admin.<your-subdomain>.workers.dev`) into `config.js` as `apiBase`. Commit that one-line change to `main`.

### 4. Verify
1. Open the GitHub Pages storefront and confirm the existing product list, category filters, price filters, search, product modal/slideshow, WhatsApp enquiry and custom order form work.
2. Click **Login** and sign in.
3. Add a test product with three publicly accessible image URLs. Confirm it appears in the dashboard and storefront after Pages deploys.
4. Edit the test product, then delete it.
5. Add a test category, rename it, and delete it after moving/deleting its products.
6. Try an incorrect password repeatedly and confirm login throttling.
7. Open the admin page in a second browser session and test that an expired/invalid token is rejected.

## Conflict handling and limitations
Writes include the GitHub blob SHA. If another editor changes `catalog.json` at the same time, GitHub rejects the stale write and the dashboard asks the user to reload; it will not silently overwrite newer catalogue data. GitHub Pages deployment is asynchronous, so a successful save may take a short time to appear publicly. This implementation stores image URLs rather than uploading image files; use public raw GitHub URLs or other HTTPS image URLs.
