import { z } from "zod";

// Schema for individual paragraphs in the document
export const paragraphSchema = z.object({
  paragraph_number: z.number(),
  word_native_para_id: z.string(),
  original_text_no_markers: z.string(),
  input_with_markers: z.string(),
  latest_edited_text: z.string(),
});

// Schema for the complete document structure
export const documentSchema = z.object({
  document_id: z.number(),
  document_title: z.string(),
  completed_stages: z.array(z.string()),
  paragraphs: z.array(paragraphSchema),
});

// Legacy schema for backward compatibility
export const suggestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number(),
  end: z.number(),
});

export const suggestionsArraySchema = z.array(suggestionSchema);
