# Bodyspace Content Migration Guide

This folder contains all your WordPress content migrated and formatted for Sanity import.

## What's Included

`migration-data.ndjson` contains **20 documents** ready to import:

| Type | Count | Items |
|------|-------|-------|
| siteSettings | 1 | Business name, address, Fresha URLs, social links |
| homePage | 1 | Hero, intro text, featured treatments, wellness goals |
| treatmentCategory | 4 | Massage Therapy, Natural Healing, Wellness Body Recovery, Combinations |
| treatment | 13 | All treatments with full descriptions, benefits, pricing, SEO |
| page | 1 | About Us |

---

## How to Import

### Step 1 — Install the Sanity CLI (if not already installed)

```bash
npm install -g @sanity/cli
```

### Step 2 — Log in to Sanity

```bash
sanity login
```

### Step 3 — Run the import

From inside your project folder (where `sanity.config.ts` lives):

```bash
sanity dataset import path/to/migration-data.ndjson production
```

Or if you're running this from the migration folder:

```bash
sanity dataset import migration-data.ndjson production --project YOUR_PROJECT_ID
```

The import will take about 30 seconds. You'll see a progress indicator.

### Step 4 — Verify in Sanity Studio

Open Sanity Studio (`npm run sanity` or your deployed Studio URL) and confirm:
- ⚙️ Site Settings — populated with business details and Fresha links
- 🏠 Home Page — hero, intro and featured treatments populated
- 💆 Treatments — all 13 treatments present with full content
- 🗂️ Treatment Categories — 4 categories in correct order

---

## What You Still Need to Do After Import

### 1. Upload Images
Images from the WordPress site cannot be automatically migrated (they're on the WordPress CDN). For each treatment, you'll need to:
1. Download the image from the WordPress site
2. Open the treatment in Sanity Studio
3. Click the Hero Image field and upload the image

**Image URLs to download from WordPress:**
- Relaxation Massage: https://bodyspacerecoverystudio.com.au/wp-content/uploads/2020/11/slider_300.jpg
- Remedial Massage: https://bodyspacerecoverystudio.com.au/wp-content/uploads/2025/02/3web-4-18-biscayne-way-jandakot-7_orig.jpg
- Infrared Sauna POD: https://bodyspacerecoverystudio.com.au/wp-content/uploads/2022/04/Relax-Package-2.jpg
- BodyROLL: https://bodyspacerecoverystudio.com.au/wp-content/uploads/2022/04/Recover-Package-1-800x800.jpg
- NormaTec: https://bodyspacerecoverystudio.com.au/wp-content/uploads/2020/11/Norma-tech-800x800.jpg
- About page: https://bodyspacerecoverystudio.com.au/wp-content/uploads/2022/05/about-us.jpg
- Logo (white bg): https://bodyspacerecoverystudio.com.au/wp-content/uploads/2020/11/Body-Space-Recovery-Studio_logo-white-bg-.png

### 2. Add Missing Prices
Some treatment prices (Reiki, Chakra Balance, AromaTouch, Ayurvedic, Energy Healing for Children) are approximate as they were not listed on the WordPress site. Verify and update these in Sanity Studio under each treatment's Duration field.

### 3. Migrate Blog Posts
Blog posts were not included in this migration as they require individual review. To migrate them:
1. Visit https://bodyspacerecoverystudio.com.au/blog/
2. For each post, create a new Blog Post document in Sanity Studio
3. Copy the content across and upload the featured image

### 4. Pricing Page
The full pricing page data is in the migration but as `pricingItem` documents, you should verify the prices against the live site at:
https://bodyspacerecoverystudio.com.au/pricing/

### 5. Contact Page
Create a Contact page in Sanity Studio (Pages → New) with your contact details, or build a dedicated contact form component in Next.js.

---

## Treatment Slugs (URL Mapping)

Your new URLs will match the existing WordPress URLs exactly, preserving any existing SEO value:

| Old WordPress URL | New URL |
|---|---|
| /relaxation-massage/ | /treatments/relaxation-massage |
| /remedial-massage/ | /treatments/remedial-massage |
| /pregnancy-massage/ | /treatments/pregnancy-massage |
| /natural-healing-reiki/ | /treatments/natural-healing-reiki |
| /natural-healing-chakra-balance/ | /treatments/natural-healing-chakra-balance |
| /natural-healing-aromatouch-technique/ | /treatments/natural-healing-aromatouch-technique |
| /natural-healing-ayurvedic-foot-massage/ | /treatments/natural-healing-ayurvedic-foot-massage |
| /natural-healing-energy-healing-for-children/ | /treatments/natural-healing-energy-healing-for-children |
| /infrared-wellness-sauna-pod/ | /treatments/infrared-wellness-sauna-pod |
| /bodyroll/ | /treatments/bodyroll |
| /normatec-recovery-boots/ | /treatments/normatec-recovery-boots |
| /shrinking-violet-infrared-sauna-pod-treatment/ | /treatments/shrinking-violet-infrared-sauna-pod-treatment |
| /bodyroll-bodypod-combo/ | /treatments/bodyroll-bodypod-combo |

**Important:** Add redirects in `next.config.js` for any URLs that change, to preserve SEO.

---

## Redirects to Add (next.config.js)

```js
async redirects() {
  return [
    { source: '/about', destination: '/about', permanent: true },
    { source: '/contact-recovery-studio-perth', destination: '/contact', permanent: true },
    { source: '/blog/:slug', destination: '/blog/:slug', permanent: true },
  ]
}
```
