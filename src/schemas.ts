import { z } from "zod";

export const titlePageSchema = z.object({
  university: z.string().min(1),
  faculty: z.string().optional().default(""),
  department: z.string().optional().default(""),
  title: z.string().min(1),
  subtitle: z.string().optional().default(""),
  author: z.string().min(1),
  group: z.string().optional().default(""),
  supervisor: z.string().min(1),
  city: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
});

export const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  level: z.number().int().min(1).max(3).default(1),
});

export const bibliographyItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["book", "article", "website", "law", "other"]).default("other"),
  raw: z.string().min(1),
});

export const documentSchema = z.object({
  documentType: z
    .enum(["report", "coursework", "diploma", "practice-report"])
    .default("report"),
  standard: z.literal("GOST_7_32_2017").default("GOST_7_32_2017"),
  language: z.enum(["ru", "en"]).default("ru"),
  titlePage: titlePageSchema,
  abstract: z.string().optional().default(""),
  introduction: z.string().optional().default(""),
  sections: z.array(sectionSchema).min(1),
  conclusion: z.string().optional().default(""),
  bibliography: z.array(bibliographyItemSchema).default([]),
  appendices: z.array(sectionSchema).default([]),
});

export type GostDocument = z.infer<typeof documentSchema>;
