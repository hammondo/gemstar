# Bodyspace Recovery Studio — Claude Code Guide

## Project Overview

Next.js 14 (App Router) + Sanity v3 website for Bodyspace Recovery Studio. Deployed on Vercel, with Sanity Studio hosted at `https://bodyspace.sanity.studio`.

## Tech Stack

- **Framework**: Next.js 14 App Router (`src/app/`)
- **CMS**: Sanity v3 (schemas in `sanity/schemas/`)
- **Styling**: Tailwind CSS v4
- **Deployment**: Vercel (Next.js) + Sanity CDN (Studio)
- **Bookings**: Fresha (external links only, no integration)

## Key Commands

```bash
npm run dev      # Next.js dev server — http://localhost:3000
npm run sanity   # Sanity Studio dev — http://localhost:3333
npm run build    # Production build (also type-checks)
```

## Project Structure

```
src/
  app/                      # Next.js App Router pages
    page.tsx                # Home page
    treatments/[slug]/      # Treatment detail pages
    blog/[slug]/            # Blog post pages
    layout.tsx
  components/
    Nav.tsx
    Footer.tsx
  lib/
    sanity.ts               # Sanity client + urlFor() image helper
    queries.ts              # All GROQ queries (single source of truth)
sanity/
  schemas/                  # Sanity content schemas
    index.ts                # Schema registry
    treatment.ts
    treatmentCategory.ts
    blogPost.ts
    pricingItem.ts
    siteSettings.ts         # Singleton — global site config
    homePage.ts             # Singleton — home page content
    page.ts
sanity.config.ts            # Sanity Studio config
```

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SANITY_PROJECT_ID=...
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_STUDIO_PROJECT_ID=...
SANITY_STUDIO_DATASET=production
```

## Architecture Notes

- **ISR**: Pages use `export const revalidate = 60` — statically generated, revalidated every 60s after Sanity publishes.
- **Images**: All images served from `cdn.sanity.io` via `@sanity/image-url`. Use the `urlFor()` helper from `src/lib/sanity.ts`.
- **GROQ queries**: All queries live in `src/lib/queries.ts`. Add new queries there, not inline in page components.
- **Singletons**: `siteSettings` and `homePage` are singleton documents (one per dataset). Do not add `create` or `delete` actions to these in the Studio config.
- **Sanity v3**: Do not use `__experimental_actions` — it was removed in v3. Restrict Studio actions via the `document.actions` resolver in `sanity.config.ts` if needed.

## Content Schema Conventions

- Rich text fields use `@portabletext/react` for rendering.
- SEO fields (`metaTitle`, `metaDescription`) are nested under a `seo` object field on documents that need them.
- All `image` fields should include `options: { hotspot: true }` unless cropping is irrelevant.
- Slugs are auto-generated from `title` with `{ source: 'title' }`.
