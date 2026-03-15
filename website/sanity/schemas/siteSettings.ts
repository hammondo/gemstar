import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  __experimental_actions: ['update', 'publish'],
  fields: [
    defineField({
      name: 'businessName',
      title: 'Business Name',
      type: 'string',
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'string',
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'address',
      title: 'Address',
      type: 'object',
      fields: [
        defineField({ name: 'street', title: 'Street', type: 'string' }),
        defineField({ name: 'suburb', title: 'Suburb', type: 'string' }),
        defineField({ name: 'state', title: 'State', type: 'string' }),
        defineField({ name: 'postcode', title: 'Postcode', type: 'string' }),
        defineField({ name: 'googleMapsUrl', title: 'Google Maps URL', type: 'url' }),
      ],
    }),
    defineField({
      name: 'phone',
      title: 'Phone',
      type: 'string',
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
    }),
    defineField({
      name: 'hours',
      title: 'Business Hours',
      type: 'string',
      description: 'e.g. "By Appointment Only"',
    }),
    defineField({
      name: 'fresha',
      title: 'Fresha Links',
      type: 'object',
      fields: [
        defineField({ name: 'bookNowUrl', title: 'Book Now URL', type: 'url' }),
        defineField({ name: 'vouchersUrl', title: 'Gift Vouchers URL', type: 'url' }),
      ],
    }),
    defineField({
      name: 'social',
      title: 'Social Media',
      type: 'object',
      fields: [
        defineField({ name: 'instagram', title: 'Instagram URL', type: 'url' }),
        defineField({ name: 'facebook', title: 'Facebook URL', type: 'url' }),
      ],
    }),
    defineField({
      name: 'seo',
      title: 'Default SEO',
      type: 'object',
      fields: [
        defineField({ name: 'metaTitle', title: 'Default Meta Title', type: 'string' }),
        defineField({ name: 'metaDescription', title: 'Default Meta Description', type: 'text', rows: 3 }),
        defineField({ name: 'ogImage', title: 'Default Social Share Image', type: 'image' }),
      ],
    }),
  ],
})
