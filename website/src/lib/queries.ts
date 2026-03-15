import { client } from './sanity'

// ─── Site Settings ───────────────────────────────────────────────────────────

export async function getSiteSettings() {
  return client.fetch(`*[_type == "siteSettings"][0]`)
}

// ─── Home Page ────────────────────────────────────────────────────────────────

export async function getHomePage() {
  return client.fetch(`
    *[_type == "homePage"][0] {
      hero,
      introHeading,
      introText,
      featuredTreatments[]-> {
        _id,
        title,
        slug,
        shortDescription,
        heroImage,
        "category": category->name,
        duration
      },
      wellnessGoals,
      showReviews,
      seo
    }
  `)
}

// ─── Treatments ───────────────────────────────────────────────────────────────

export async function getAllTreatments() {
  return client.fetch(`
    *[_type == "treatment"] | order(displayOrder asc) {
      _id,
      title,
      slug,
      shortDescription,
      heroImage,
      "category": category->{ name, slug },
      duration
    }
  `)
}

export async function getTreatmentBySlug(slug: string) {
  return client.fetch(`
    *[_type == "treatment" && slug.current == $slug][0] {
      _id,
      title,
      slug,
      body,
      heroImage,
      "category": category->{ name, slug },
      benefits,
      duration,
      faqs,
      freshaUrl,
      seo
    }
  `, { slug })
}

export async function getTreatmentsByCategory() {
  return client.fetch(`
    *[_type == "treatmentCategory"] | order(displayOrder asc) {
      _id,
      name,
      slug,
      description,
      "treatments": *[_type == "treatment" && references(^._id)] | order(displayOrder asc) {
        _id,
        title,
        slug,
        shortDescription,
        heroImage,
        duration
      }
    }
  `)
}

// ─── Blog ─────────────────────────────────────────────────────────────────────

export async function getAllBlogPosts() {
  return client.fetch(`
    *[_type == "blogPost"] | order(publishedAt desc) {
      _id,
      title,
      slug,
      publishedAt,
      author,
      heroImage,
      excerpt,
      tags
    }
  `)
}

export async function getBlogPostBySlug(slug: string) {
  return client.fetch(`
    *[_type == "blogPost" && slug.current == $slug][0] {
      _id,
      title,
      slug,
      publishedAt,
      author,
      heroImage,
      body,
      tags,
      relatedTreatments[]-> {
        title,
        slug,
        shortDescription,
        heroImage
      },
      seo
    }
  `, { slug })
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export async function getPricing() {
  return client.fetch(`
    *[_type == "pricingItem"] | order(displayOrder asc) {
      _id,
      label,
      "treatmentTitle": treatment->title,
      options
    }
  `)
}

// ─── Pages ────────────────────────────────────────────────────────────────────

export async function getPageBySlug(slug: string) {
  return client.fetch(`
    *[_type == "page" && slug.current == $slug][0] {
      title,
      heroImage,
      body,
      seo
    }
  `, { slug })
}
