import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const caseStudies = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/case-studies' }),
  schema: z.object({
    title: z.string(),
    client: z.string(),
    summary: z.string(),
    date: z.coerce.date(),
    order: z.number().default(0),
    draft: z.boolean().default(false),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    outcomes: z.array(z.string()).optional(),
  }),
});

export const collections = { caseStudies };
