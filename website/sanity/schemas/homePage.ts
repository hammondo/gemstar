import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'homePage',
  title: 'Home Page',
  type: 'document',
  fields: [
    defineField({
      name: 'hero',
      title: 'Hero Section',
      type: 'object',
      fields: [
        defineField({ name: 'headline', title: 'Headline', type: 'string' }),
        defineField({ name: 'subheading', title: 'Subheading', type: 'text', rows: 2 }),
        defineField({ name: 'image', title: 'Background Image', type: 'image', options: { hotspot: true } }),
        defineField({ name: 'ctaText', title: 'CTA Button Text', type: 'string' }),
      ],
    }),
    defineField({
      name: 'introHeading',
      title: 'Intro Section Heading',
      type: 'string',
    }),
    defineField({
      name: 'introText',
      title: 'Intro Section Text',
      type: 'text',
      rows: 5,
    }),
    defineField({
      name: 'featuredTreatments',
      title: 'Featured Treatments',
      description: 'Select up to 6 treatments to highlight on the home page',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'treatment' }] }],
      validation: (Rule) => Rule.max(6),
    }),
    defineField({
      name: 'wellnessGoals',
      title: 'Wellness Goals Section',
      description: 'The "Hit your wellness goals" benefit tiles',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'icon', title: 'Icon Image', type: 'image' }),
            defineField({ name: 'label', title: 'Label', type: 'string', description: 'e.g. "Detox"' }),
            defineField({ name: 'tagline', title: 'Tagline', type: 'string', description: 'e.g. "Release toxins"' }),
            defineField({ name: 'description', title: 'Description', type: 'text', rows: 3 }),
          ],
          preview: {
            select: { title: 'label', media: 'icon' },
          },
        },
      ],
    }),
    defineField({
      name: 'showReviews',
      title: 'Show Google Reviews',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'object',
      fields: [
        defineField({ name: 'metaTitle', title: 'Meta Title', type: 'string' }),
        defineField({ name: 'metaDescription', title: 'Meta Description', type: 'text', rows: 3 }),
      ],
    }),
  ],
})
