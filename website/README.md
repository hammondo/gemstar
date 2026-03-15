# Bodyspace Recovery Studio — Next.js + Sanity

A modern, fast, SEO-optimised website for Bodyspace Recovery Studio built with **Next.js 14** (App Router) and **Sanity v3** as the headless CMS.

---

## Tech Stack

| Layer       | Technology          |
|-------------|---------------------|
| Framework   | Next.js 14 (App Router) |
| CMS         | Sanity v3           |
| Styling     | Tailwind CSS        |
| Deployment  | Vercel              |
| Images      | Sanity CDN          |
| Bookings    | Fresha (external link) |

---

## Project Structure

```
bodyspace/
├── sanity/
│   └── schemas/            # All Sanity content schemas
│       ├── index.ts
│       ├── treatment.ts
│       ├── treatmentCategory.ts
│       ├── blogPost.ts
│       ├── pricingItem.ts
│       ├── siteSettings.ts
│       ├── homePage.ts
│       └── page.ts
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── layout.tsx
│   │   ├── page.tsx        # Home page
│   │   ├── treatments/
│   │   │   └── [slug]/page.tsx
│   │   └── blog/
│   │       └── [slug]/page.tsx
│   ├── components/         # Shared UI components
│   │   ├── Nav.tsx
│   │   └── Footer.tsx
│   └── lib/
│       ├── sanity.ts       # Sanity client + image builder
│       └── queries.ts      # All GROQ queries
├── sanity.config.ts        # Sanity Studio configuration
├── .env.local.example
└── package.json
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Sanity project

1. Go to [sanity.io/manage](https://www.sanity.io/manage)
2. Click **New Project**
3. Name it `Bodyspace Recovery Studio`
4. Choose the **Free** plan
5. Note your **Project ID** and **Dataset** name (default: `production`)

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your Sanity Project ID:

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id_here
NEXT_PUBLIC_SANITY_DATASET=production
```

### 4. Run the development server

In one terminal, run the Next.js app:

```bash
npm run dev
```

In a second terminal, run Sanity Studio:

```bash
npm run sanity
```

- **Next.js app**: [http://localhost:3000](http://localhost:3000)
- **Sanity Studio**: [http://localhost:3333](http://localhost:3333)

---

## Content Setup in Sanity Studio

Once Sanity Studio is running, populate content in this order:

### Step 1 — Site Settings
Fill in business name, address, phone, Fresha URLs, and social links. This data is used globally across the site (nav, footer, booking buttons).

### Step 2 — Treatment Categories
Create the 4 categories in display order:
1. Massage Therapy
2. Natural Healing
3. Wellness Body Recovery
4. Combinations

### Step 3 — Treatments
Create each treatment, assigning it to a category. Key fields:
- **Short Description** — shown on cards and listings (keep under 200 chars)
- **Body** — full rich-text description for the treatment detail page
- **Duration** — add price tiers (e.g. 30 min / 60 min)
- **Benefits** — bullet points shown in the sidebar
- **Fresha URL** — direct booking link for this specific treatment

### Step 4 — Home Page
Configure the homepage singleton:
- Hero headline, subheading, and background image
- Select up to 6 featured treatments
- Add wellness goal tiles (Detox, Weight Loss, etc.)

### Step 5 — Pricing
Add pricing items referencing your treatments.

### Step 6 — Blog Posts
Migrate existing WordPress blog posts here.

---

## Content Schema Reference

### Treatment fields
| Field | Type | Staff-editable | Notes |
|-------|------|---------------|-------|
| title | string | ✅ | |
| slug | slug | ✅ | Auto-generated from title |
| category | reference | ✅ | |
| heroImage | image | ✅ | Supports hotspot cropping |
| shortDescription | text | ✅ | Max 200 chars |
| body | rich text | ✅ | Supports images inline |
| benefits | string array | ✅ | Shown as bullet list |
| duration | object array | ✅ | Minutes + price pairs |
| faqs | object array | ✅ | Question + answer pairs |
| freshaUrl | url | ✅ | Override global booking URL |
| seo.metaTitle | string | ✅ | |
| seo.metaDescription | text | ✅ | |

### Blog Post fields
| Field | Type | Staff-editable | Notes |
|-------|------|---------------|-------|
| title | string | ✅ | |
| slug | slug | ✅ | Auto-generated |
| publishedAt | datetime | ✅ | |
| author | string | ✅ | |
| heroImage | image | ✅ | |
| excerpt | text | ✅ | Shown in listings |
| body | rich text | ✅ | Supports images |
| tags | string array | ✅ | |
| relatedTreatments | references | ✅ | Shown at bottom of post |

---

## Deployment

### Deploy to Vercel (recommended)

```bash
npm install -g vercel
vercel
```

Add your environment variables in the Vercel dashboard under **Settings → Environment Variables**.

### Deploy Sanity Studio

Sanity Studio can be deployed to Sanity's own CDN (free):

```bash
npx sanity deploy
```

This gives you a URL like `https://bodyspace.sanity.studio` where staff can log in and edit content from any browser.

---

## How ISR (Incremental Static Regeneration) Works

Pages are statically generated at build time and automatically revalidated every 60 seconds (`export const revalidate = 60`). This means:

- The site is fast (served from CDN)
- When staff publish changes in Sanity, the live site updates within ~60 seconds
- No manual deploys needed for content changes

---

## Adding New Pages

1. In Sanity Studio → **Pages** → click **+**
2. Add a title, slug, and content
3. In Next.js, add a new route at `src/app/[your-slug]/page.tsx` that calls `getPageBySlug()`

---

## Migrating from WordPress

1. Export WordPress content via **Tools → Export** (XML)
2. Use [wordpress-export-to-markdown](https://github.com/lonekorean/wordpress-export-to-markdown) to convert posts
3. Copy content into Sanity Studio manually, or use the [Sanity CLI import](https://www.sanity.io/docs/data-store/importing-data) for bulk import

---

## Questions & Support

For help with the codebase, ask Claude at [claude.ai](https://claude.ai) — share this README and the relevant file for targeted assistance.
