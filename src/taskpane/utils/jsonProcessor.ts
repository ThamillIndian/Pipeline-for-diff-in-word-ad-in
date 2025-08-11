/**
 * JSON processor for handling the specific document format
 * Generates character offset mappings and suggestions for the diff pipeline
 */

import { DocumentData, ParagraphData } from './documentMapping';
import { documentSchema } from './jsonSchema';

export interface ProcessedSuggestion {
  id: string;
  text: string;
  start: number;
  end: number;
  paragraphNumber: number;
  wordNativeParaId: string;
  changeType: 'addition' | 'deletion' | 'modification';
  originalText: string;
  editedText: string;
}

export interface ProcessingResult {
  documentData: DocumentData;
  suggestions: ProcessedSuggestion[];
  // Legacy properties removed - buildCharacterOffsetDict and findTextDifferences no longer exist
  // characterMappings: ReturnType<typeof buildCharacterOffsetDict>;
  // differences: ReturnType<typeof findTextDifferences>;
  totalCharacters: number;
}

/**
 * Process the JSON document and generate suggestions with character offsets
 */
export function processDocumentJson(jsonData: any): ProcessingResult {
  // Validate the JSON structure
  const parseResult = documentSchema.safeParse(jsonData);
  if (!parseResult.success) {
    throw new Error(`Invalid document JSON structure: ${parseResult.error.message}`);
  }

  const documentData = parseResult.data;
  
  console.log('Legacy character mapping functions have been removed. Use processCorrectionData instead.');
  
  // Legacy suggestion generation removed - no longer functional without buildCharacterOffsetDict
  const suggestions: ProcessedSuggestion[] = [];
  
  // Calculate total characters from paragraphs
  let totalCharacters = 0;
  for (const paragraph of documentData.paragraphs) {
    totalCharacters += paragraph.original_text_no_markers.length;
  }
  
  return {
    documentData,
    suggestions,
    // Legacy properties removed
    // characterMappings,
    // differences,
    totalCharacters,
  };
}

/**
 * Generate suggestions for specific paragraphs that have changes
 */
export function generateParagraphSuggestions(documentData: DocumentData, paragraphNumbers?: number[]): ProcessedSuggestion[] {
  // Legacy function - buildCharacterOffsetDict no longer exists
  console.warn('generateParagraphSuggestions uses legacy functions. Use processCorrectionData instead.');
  
  const suggestions: ProcessedSuggestion[] = [];
  
  const targetParagraphs = paragraphNumbers 
    ? documentData.paragraphs.filter(p => paragraphNumbers.includes(p.paragraph_number))
    : documentData.paragraphs;
  
  // Simple fallback without character mapping
  let currentOffset = 0;
  for (const paragraph of targetParagraphs) {
    // Check if there are differences in this paragraph
    const originalText = paragraph.original_text_no_markers;
    const editedText = removeMarkupTags(paragraph.latest_edited_text);
    
    if (originalText !== editedText) {
      const suggestion: ProcessedSuggestion = {
        id: `${paragraph.word_native_para_id}_modification`,
        text: editedText,
        start: currentOffset,
        end: currentOffset + originalText.length,
        paragraphNumber: paragraph.paragraph_number,
        wordNativeParaId: paragraph.word_native_para_id,
        changeType: 'modification',
        originalText: originalText,
        editedText: editedText,
      };
      
      suggestions.push(suggestion);
    }
    
    currentOffset += originalText.length;
  }
  
  return suggestions;
}

/**
 * Convert processed suggestions to the legacy format for backward compatibility
 */
export function convertToLegacyFormat(suggestions: ProcessedSuggestion[]): Array<{id: string, text: string, start: number, end: number}> {
  return suggestions.map(suggestion => ({
    id: suggestion.id,
    text: suggestion.text,
    start: suggestion.start,
    end: suggestion.end,
  }));
}

/**
 * Create character offset mappings for specific text segments
 */
export function createSegmentMappings(documentData: DocumentData, segments: Array<{text: string, paragraphNumber?: number}>): ProcessedSuggestion[] {
  // Legacy function - buildCharacterOffsetDict no longer exists
  console.warn('createSegmentMappings uses legacy functions. Use processCorrectionData instead.');
  
  // Simple fallback without character mapping
  const suggestions: ProcessedSuggestion[] = [];
  
  // Create simple mappings from document paragraphs
  let currentOffset = 0;
  const simpleMappings = documentData.paragraphs.map(paragraph => ({
    paragraphNumber: paragraph.paragraph_number,
    wordNativeParaId: paragraph.word_native_para_id,
    originalText: paragraph.original_text_no_markers,
    startOffset: currentOffset,
    endOffset: (currentOffset += paragraph.original_text_no_markers.length)
  }));
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // Find the segment in the document
    let found = false;
    
    for (const mapping of simpleMappings) {
      // If paragraph number is specified, only search in that paragraph
      if (segment.paragraphNumber && mapping.paragraphNumber !== segment.paragraphNumber) {
        continue;
      }
      
      const textIndex = mapping.originalText.indexOf(segment.text);
      if (textIndex !== -1) {
        const suggestion: ProcessedSuggestion = {
          id: `segment_${i}_${mapping.wordNativeParaId}`,
          text: segment.text,
          start: mapping.startOffset + textIndex,
          end: mapping.startOffset + textIndex + segment.text.length,
          paragraphNumber: mapping.paragraphNumber,
          wordNativeParaId: mapping.wordNativeParaId,
          changeType: 'modification',
          originalText: segment.text,
          editedText: segment.text,
        };
        
        suggestions.push(suggestion);
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.warn(`Segment not found in document: "${segment.text}"`);
    }
  }
  
  return suggestions;
}

/**
 * Remove markup tags from text
 */
function removeMarkupTags(text: string): string {
  return text
    .replace(/<\{[^}]+\}\s*/g, '') // Remove style tags like <{ch_head}>
    .replace(/<\[[^]]+]>/g, '') // Remove formatting tags like <[b]>, <[/b]>
    .trim();
}

/**
 * Validate character offsets against document structure
 */
export function validateCharacterOffsets(documentData: DocumentData, suggestions: ProcessedSuggestion[]): Array<{suggestion: ProcessedSuggestion, valid: boolean, error?: string}> {
  // Legacy function - buildCharacterOffsetDict no longer exists
  console.warn('validateCharacterOffsets uses legacy functions. Use processCorrectionData instead.');
  
  // Simple fallback: calculate total characters from paragraphs
  let totalCharacters = 0;
  for (const paragraph of documentData.paragraphs) {
    totalCharacters += paragraph.original_text_no_markers.length;
  }
  
  return suggestions.map(suggestion => {
    const validation = { suggestion, valid: true, error: undefined as string | undefined };
    
    // Check if offsets are within bounds
    if (suggestion.start < 0 || suggestion.end < 0) {
      validation.valid = false;
      validation.error = 'Negative character offsets';
      return validation;
    }
    
    if (suggestion.start >= totalCharacters || suggestion.end > totalCharacters) {
      validation.valid = false;
      validation.error = `Character offsets exceed document length (${totalCharacters})`;
      return validation;
    }
    
    if (suggestion.start >= suggestion.end) {
      validation.valid = false;
      validation.error = 'Start offset must be less than end offset';
      return validation;
    }
    
    // Legacy text extraction removed - no longer functional without character mappings
    const extractedText = 'Legacy function - cannot extract text without character mappings';
    
    if (extractedText !== suggestion.originalText && extractedText !== suggestion.text) {
      validation.valid = false;
      validation.error = `Text mismatch. Expected: "${suggestion.text}", Found: "${extractedText}"`;
    }
    
    return validation;
  });
}

/**
 * Verify suggestions against JSON data directly
 * This avoids the conceptual mismatch of verifying against a modified document
 */
export function verifySuggestionsAgainstJson(_documentData: DocumentData, suggestions: ProcessedSuggestion[]): Array<{id: string, valid: boolean, error?: string, expected: string, found: string}> {
  // Legacy function - buildCharacterOffsetDict no longer exists
  console.warn('verifySuggestionsAgainstJson uses legacy functions. Use processCorrectionData instead.');
  
  const results: Array<{id: string, valid: boolean, error?: string, expected: string, found: string}> = [];
  
  for (const suggestion of suggestions) {
    // Legacy text extraction removed - no longer functional without character mappings
    const extractedText = 'Legacy function - cannot extract text without character mappings';
    const expectedText = suggestion.originalText;
    const isValid = false; // Always false since legacy function is non-functional
    
    results.push({
      id: suggestion.id,
      valid: isValid,
      expected: expectedText,
      found: extractedText,
      error: 'Legacy function - use processCorrectionData instead'
    });
  }
  
  return results;
}

/**
 * Export utility functions for testing and debugging
 */
// Legacy import removed - computeTextChanges no longer exists
// import { computeTextChanges } from './documentMapping';

export const utils = {
  removeMarkupTags,
  // Legacy functions removed
  // buildCharacterOffsetDict,
  // findTextDifferences,
};
