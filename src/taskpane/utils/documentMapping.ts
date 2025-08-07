/**
 * Document mapping utilities for handling paragraph-based character offsets
 * Tailored for the specific JSON document structure without newline handling
 */

import { documentSchema, paragraphSchema } from './jsonSchema';
import { z } from 'zod';
import { diff_match_patch } from 'diff-match-patch';

export type DocumentData = z.infer<typeof documentSchema>;
export type ParagraphData = z.infer<typeof paragraphSchema>;

export interface CharacterOffsetMapping {
  paragraphNumber: number;
  wordNativeParaId: string;
  originalText: string;
  inputWithMarkers: string;
  latestEditedText: string;
  startOffset: number;
  endOffset: number;
  wordParagraph?: Word.Paragraph;
}

export interface TextDifference {
  paragraphNumber: number;
  wordNativeParaId: string;
  originalText: string;
  editedText: string;
  startOffset: number;
  endOffset: number;
  changes: {
    type: 'addition' | 'deletion' | 'modification';
    originalStart: number;
    originalEnd: number;
    editedStart: number;
    editedEnd: number;
    originalContent: string;
    editedContent: string;
  }[];
}

/**
 * Build character offset dictionary from document JSON data
 * This creates a mapping without considering newlines between paragraphs
 */
export function buildCharacterOffsetDict(documentData: DocumentData): CharacterOffsetMapping[] {
  const mappings: CharacterOffsetMapping[] = [];
  let currentOffset = 0;

  for (const paragraph of documentData.paragraphs) {
    // Use original_text_no_markers for character counting as it's the base text
    const textLength = paragraph.original_text_no_markers.length;
    
    const mapping: CharacterOffsetMapping = {
      paragraphNumber: paragraph.paragraph_number,
      wordNativeParaId: paragraph.word_native_para_id,
      originalText: paragraph.original_text_no_markers,
      inputWithMarkers: paragraph.input_with_markers,
      latestEditedText: paragraph.latest_edited_text,
      startOffset: currentOffset,
      endOffset: currentOffset + textLength,
    };

    mappings.push(mapping);
    currentOffset += textLength;
  }

  return mappings;
}

/**
 * Build character offset dictionary from Word document paragraphs
 * This syncs with the actual Word document structure
 */
export async function buildWordCharacterOffsetDict(context: Word.RequestContext): Promise<CharacterOffsetMapping[]> {
  const paragraphs = context.document.body.paragraphs;
  paragraphs.load("items, items/text");
  await context.sync();

  const mappings: CharacterOffsetMapping[] = [];
  let currentOffset = 0;

  paragraphs.items.forEach((paragraph, index) => {
    const textLength = paragraph.text.length;
    
    const mapping: CharacterOffsetMapping = {
      paragraphNumber: index + 1, // 1-based indexing
      wordNativeParaId: `WORD_PARA_${index + 1}`, // Generate ID for Word paragraphs
      originalText: paragraph.text,
      inputWithMarkers: paragraph.text,
      latestEditedText: paragraph.text,
      startOffset: currentOffset,
      endOffset: currentOffset + textLength,
      wordParagraph: paragraph,
    };

    mappings.push(mapping);
    currentOffset += textLength;
  });

  return mappings;
}

/**
 * Find the paragraph mapping that contains the given character offset
 */
export function findParagraphByOffset(mappings: CharacterOffsetMapping[], offset: number): CharacterOffsetMapping | null {
  return mappings.find(mapping => 
    offset >= mapping.startOffset && offset < mapping.endOffset
  ) || null;
}

/**
 * Find paragraphs that intersect with the given offset range
 */
export function findParagraphsByRange(mappings: CharacterOffsetMapping[], startOffset: number, endOffset: number): CharacterOffsetMapping[] {
  return mappings.filter(mapping => 
    // Check if ranges overlap
    !(endOffset <= mapping.startOffset || startOffset >= mapping.endOffset)
  );
}

/**
 * Get Word Range for specific character offsets using the mapping
 */
export async function getRangeForCharacterOffsets(
  context: Word.RequestContext,
  startOffset: number,
  endOffset: number,
  mappings?: CharacterOffsetMapping[]
): Promise<Word.Range | null> {
  // If mappings not provided, build from Word document
  if (!mappings) {
    mappings = await buildWordCharacterOffsetDict(context);
  }

  const affectedParagraphs = findParagraphsByRange(mappings, startOffset, endOffset);
  
  if (affectedParagraphs.length === 0) {
    console.warn(`No paragraphs found for offset range ${startOffset}-${endOffset}`);
    return null;
  }

  try {
    if (affectedParagraphs.length === 1) {
      // Single paragraph case
      const paragraph = affectedParagraphs[0];
      const localStartOffset = startOffset - paragraph.startOffset;
      const localEndOffset = endOffset - paragraph.startOffset;
      
      if (paragraph.wordParagraph) {
        const paragraphRange = paragraph.wordParagraph.getRange();
        const textToFind = paragraph.originalText.substring(localStartOffset, localEndOffset);
        
        // Search for the exact text within the paragraph
        const searchResults = paragraphRange.search(textToFind, { matchCase: true, matchWholeWord: false });
        searchResults.load("items");
        await context.sync();
        
        if (searchResults.items.length > 0) {
          return searchResults.items[0];
        }
      }
    } else {
      // Multi-paragraph case
      const ranges: Word.Range[] = [];
      
      for (let i = 0; i < affectedParagraphs.length; i++) {
        const paragraph = affectedParagraphs[i];
        let localStartOffset = 0;
        let localEndOffset = paragraph.originalText.length;
        
        // Adjust offsets for first and last paragraphs
        if (i === 0) {
          localStartOffset = startOffset - paragraph.startOffset;
        }
        if (i === affectedParagraphs.length - 1) {
          localEndOffset = endOffset - paragraph.startOffset;
        }
        
        if (paragraph.wordParagraph) {
          const paragraphRange = paragraph.wordParagraph.getRange();
          const textToFind = paragraph.originalText.substring(localStartOffset, localEndOffset);
          
          if (textToFind.length > 0) {
            const searchResults = paragraphRange.search(textToFind, { matchCase: true, matchWholeWord: false });
            searchResults.load("items");
            await context.sync();
            
            if (searchResults.items.length > 0) {
              ranges.push(searchResults.items[0]);
            }
          }
        }
      }
      
      // Combine ranges if multiple paragraphs
      if (ranges.length > 1) {
        let combinedRange = ranges[0];
        for (let i = 1; i < ranges.length; i++) {
          try {
            combinedRange = combinedRange.expandTo(ranges[i]);
          } catch (error) {
            console.warn("Could not combine ranges across paragraphs:", error);
            // Return the first range as fallback
            return ranges[0];
          }
        }
        return combinedRange;
      } else if (ranges.length === 1) {
        return ranges[0];
      }
    }
  } catch (error) {
    console.error("Error getting range for character offsets:", error);
  }

  return null;
}

/**
 * Compare original and edited text to find differences
 */
export function findTextDifferences(documentData: DocumentData): TextDifference[] {
  const differences: TextDifference[] = [];
  const mappings = buildCharacterOffsetDict(documentData);

  for (const mapping of mappings) {
    const paragraph = documentData.paragraphs.find(p => p.paragraph_number === mapping.paragraphNumber);
    if (!paragraph) continue;

    // Remove markup tags for comparison
    const cleanOriginal = paragraph.original_text_no_markers;
    const cleanEdited = removeMarkupTags(paragraph.latest_edited_text);

    if (cleanOriginal !== cleanEdited) {
      const changes = computeTextChanges(cleanOriginal, cleanEdited);
      
      differences.push({
        paragraphNumber: mapping.paragraphNumber,
        wordNativeParaId: mapping.wordNativeParaId,
        originalText: cleanOriginal,
        editedText: cleanEdited,
        startOffset: mapping.startOffset,
        endOffset: mapping.endOffset,
        changes,
      });
    }
  }

  return differences;
}

/**
 * Remove markup tags from text (simplified version)
 */
function removeMarkupTags(text: string): string {
  // Remove tags like <{tag_name}>, <[tag]>, <[/tag]>
  return text
    .replace(/<\{[^}]+\}>\s*/g, '') // Remove style tags like <{ch_head}>
    .replace(/<\[[^\]]+\]>/g, '') // Remove formatting tags like <[b]>, <[/b]>
    .trim();
}

/**
 * Compute changes between original and edited text using diff-match-patch
 */
export function computeTextChanges(original: string, edited: string): TextDifference['changes'] {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(original, edited);
  dmp.diff_cleanupSemantic(diffs);

  const changes: TextDifference['changes'] = [];
  let originalCursor = 0;
  let editedCursor = 0;

  for (const [op, text] of diffs) {
    switch (op) {
      case 1: // Addition
        changes.push({
          type: 'addition',
          originalStart: originalCursor,
          originalEnd: originalCursor,
          editedStart: editedCursor,
          editedEnd: editedCursor + text.length,
          originalContent: '',
          editedContent: text,
        });
        editedCursor += text.length;
        break;
      case -1: // Deletion
        changes.push({
          type: 'deletion',
          originalStart: originalCursor,
          originalEnd: originalCursor + text.length,
          editedStart: editedCursor,
          editedEnd: editedCursor,
          originalContent: text,
          editedContent: '',
        });
        originalCursor += text.length;
        break;
      case 0: // No change
        originalCursor += text.length;
        editedCursor += text.length;
        break;
    }
  }

  return changes;
}

/**
 * Verify that character offsets map correctly to expected text
 */
export async function verifyCharacterMapping(
  context: Word.RequestContext,
  startOffset: number,
  endOffset: number,
  expectedText: string,
  mappings?: CharacterOffsetMapping[]
): Promise<{ extracted: string; matches: boolean; mapping?: CharacterOffsetMapping[] }> {
  if (!mappings) {
    mappings = await buildWordCharacterOffsetDict(context);
  }

  const affectedParagraphs = findParagraphsByRange(mappings, startOffset, endOffset);
  let extractedText = '';

  for (const paragraph of affectedParagraphs) {
    const localStartOffset = Math.max(0, startOffset - paragraph.startOffset);
    const localEndOffset = Math.min(paragraph.originalText.length, endOffset - paragraph.startOffset);
    
    if (localEndOffset > localStartOffset) {
      extractedText += paragraph.originalText.substring(localStartOffset, localEndOffset);
    }
  }

  const matches = extractedText === expectedText;
  
  console.log(`Character mapping verification:
    Start: ${startOffset}, End: ${endOffset}
    Extracted: "${extractedText}"
    Expected: "${expectedText}"
    Matches: ${matches}`);

  return {
    extracted: extractedText,
    matches,
    mapping: affectedParagraphs,
  };
}
