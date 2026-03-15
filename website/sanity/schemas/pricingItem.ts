import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'pricingItem',
  title: 'Pricing Item',
  type: 'document',
  fields: [
    defineField({
      name: 'treatment',
      title: 'Treatment',
      type: 'reference',
      to: [{ type: 'treatment' }],
    }),
    defineField({
      name: 'label',
      title: 'Label Override',
      description: 'Optional: Override the treatment name for pricing display',
      type: 'string',
    }),
    defineField({
      name: 'options',
      title: 'Pricing Options',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'duration', title: 'Duration', type: 'string', description: 'e.g. "30 min", "1 hour"' }),
            defineField({ name: 'price', title: 'Price (AUD)', type: 'number' }),
            defineField({ name: 'note', title: 'Note', type: 'string', description: 'e.g. "includes consultation"' }),
          ],
          preview: {
            select: { duration: 'duration', price: 'price' },
            prepare: ({ duration, price }) => ({ title: `${duration} — $${price}` }),
          },
        },
      ],
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display Order',
      type: 'number',
    }),
  ],
  preview: {
    select: {
      label: 'label',
      treatment: 'treatment.title',
    },
    prepare({ label, treatment }) {
      return { title: label || treatment }
    },
  },
})
