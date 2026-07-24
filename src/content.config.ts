// src/content.config.ts  (Astro 6 — must live at src/content.config.ts with glob loader)
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// "Latest From Jimmy" — videos, essays, surveys, and tools, in one place.
// Replaces the old `posts` collection and the hardcoded card array in
// src/components/ShareListing.astro. See docs/management_of_change.md and
// docs/share/AddShareMessage.md for the migration this collection is part of.
const messages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/messages' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    type: z.enum(['video', 'essay', 'survey', 'tool']).default('essay'),
    summary: z.string(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    thumbnail: z.string().optional(),
    // Actual pixel dimensions of `thumbnail` — required alongside it so
    // og:image:width/height are correct. Different thumbnails are not all
    // the same size (ffmpeg frame grabs vs. existing meme images differ).
    thumbnailWidth: z.number().optional(),
    thumbnailHeight: z.number().optional(),
    videoUrl: z.string().optional(),
    duration: z.string().optional(),
    ctaLabel: z.string().default('Read more'),
    // Old /share/<slug> this message replaces, so a redirect can be wired up.
    legacySlug: z.string().optional(),
    share: z
      .object({
        tweetText: z.string().optional(),
        emailSubject: z.string().optional(),
        emailBody: z.string().optional(),
      })
      .optional(),
  }),
});

export const collections = { messages };
