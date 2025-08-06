import { z } from "zod";

// Adjust this schema to your actual JSON structure
export const suggestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number(),
  end: z.number(),
  // Add more fields as needed
});

export const suggestionsArraySchema = z.array(suggestionSchema);
