import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'treatment',
  title: 'Treatment',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Treatment Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: [{ type: 'treatmentCategory' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({ name: 'alt', title: 'Alt Text', type: 'string' }),
      ],
    }),
    defineField({
      name: 'shortDescription',
      title: 'Short Description',
      description: 'Used in treatment cards and listings (1-2 sentences)',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required().max(200),
    }),
    defineField({
      name: 'body',
      title: 'Full Description',
      type: 'array',
      of: [
        { type: 'block' },
        { type: 'image', options: { hotspot: true } },
      ],
    }),
    defineField({
      name: 'benefits',
      title: 'Benefits',
      description: 'Key benefits shown as bullet points',
      type: 'array',
      of: [{ type: 'string' }],
    }),
    defineField({
      name: 'duration',
      title: 'Duration Options',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'minutes', title: 'Minutes', type: 'number' }),
            defineField({ name: 'price', title: 'Price (AUD)', type: 'number' }),
          ],
          preview: {
            select: { minutes: 'minutes', price: 'price' },
            prepare: ({ minutes, price }) => ({
              title: `${minutes} min — $${price}`,
            }),
          },
        },
      ],
    }),
    defineField({
      name: 'faqs',
      title: 'FAQs',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'question', title: 'Question', type: 'string' }),
            defineField({ name: 'answer', title: 'Answer', type: 'text' }),
          ],
          preview: {
            select: { title: 'question' },
          },
        },
      ],
    }),
    defineField({
      name: 'freshaUrl',
      title: 'Fresha Booking URL',
      description: 'Direct Fresha link for this specific treatment',
      type: 'url',
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
    defineField({
      name: 'displayOrder',
      title: 'Display Order',
      description: 'Lower numbers appear first',
      type: 'number',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      category: 'category.name',
      media: 'heroImage',
    },
    prepare({ title, category, media }) {
      return { title, subtitle: category, media }
    },
  },
  orderings: [
    {
      title: 'Display Order',
      name: 'displayOrderAsc',
      by: [{ field: 'displayOrder', direction: 'asc' }],
    },
  ],
})
