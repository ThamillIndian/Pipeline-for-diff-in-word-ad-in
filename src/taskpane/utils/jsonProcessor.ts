/**
 * JSON processor for handling the specific document format
 * Generates character offset mappings and suggestions for the diff pipeline
 */

import { DocumentData, ParagraphData, buildCharacterOffsetDict, findTextDifferences } from './documentMapping';
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
  characterMappings: ReturnType<typeof buildCharacterOffsetDict>;
  differences: ReturnType<typeof findTextDifferences>;
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
  
  // Build character offset mappings
  const characterMappings = buildCharacterOffsetDict(documentData);
  
  // Find differences between original and edited text
  const differences = findTextDifferences(documentData);
  
  // Generate suggestions based on differences
  const suggestions: ProcessedSuggestion[] = [];
  
  for (const diff of differences) {
    for (const change of diff.changes) {
      const suggestion: ProcessedSuggestion = {
        id: `${diff.wordNativeParaId}_${change.type}_${change.originalStart}`,
        text: change.editedContent,
        start: diff.startOffset + change.originalStart,
        end: diff.startOffset + change.originalEnd,
        paragraphNumber: diff.paragraphNumber,
        wordNativeParaId: diff.wordNativeParaId,
        changeType: change.type,
        originalText: change.originalContent,
        editedText: change.editedContent,
      };
      
      suggestions.push(suggestion);
    }
  }
  
  // Calculate total characters
  const totalCharacters = characterMappings.reduce((total, mapping) => Math.max(total, mapping.endOffset), 0);
  
  return {
    documentData,
    suggestions,
    characterMappings,
    differences,
    totalCharacters,
  };
}

/**
 * Generate suggestions for specific paragraphs that have changes
 */
export function generateParagraphSuggestions(documentData: DocumentData, paragraphNumbers?: number[]): ProcessedSuggestion[] {
  const characterMappings = buildCharacterOffsetDict(documentData);
  const suggestions: ProcessedSuggestion[] = [];
  
  const targetParagraphs = paragraphNumbers 
    ? documentData.paragraphs.filter(p => paragraphNumbers.includes(p.paragraph_number))
    : documentData.paragraphs;
  
  for (const paragraph of targetParagraphs) {
    const mapping = characterMappings.find(m => m.paragraphNumber === paragraph.paragraph_number);
    if (!mapping) continue;
    
    // Check if there are differences in this paragraph
    const originalText = paragraph.original_text_no_markers;
    const editedText = removeMarkupTags(paragraph.latest_edited_text);
    
    if (originalText !== editedText) {
      const suggestion: ProcessedSuggestion = {
        id: `${paragraph.word_native_para_id}_modification`,
        text: editedText,
        start: mapping.startOffset,
        end: mapping.endOffset,
        paragraphNumber: paragraph.paragraph_number,
        wordNativeParaId: paragraph.word_native_para_id,
        changeType: 'modification',
        originalText: originalText,
        editedText: editedText,
      };
      
      suggestions.push(suggestion);
    }
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
  const characterMappings = buildCharacterOffsetDict(documentData);
  const suggestions: ProcessedSuggestion[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // Find the segment in the document
    let found = false;
    
    for (const mapping of characterMappings) {
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
  const characterMappings = buildCharacterOffsetDict(documentData);
  const totalCharacters = characterMappings.reduce((total, mapping) => Math.max(total, mapping.endOffset), 0);
  
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
    
    // Check if the text at the specified offsets matches
    let extractedText = '';
    const affectedMappings = characterMappings.filter(mapping => !(suggestion.end <= mapping.startOffset || suggestion.start >= mapping.endOffset));
    
    for (const mapping of affectedMappings) {
      const localStart = Math.max(0, suggestion.start - mapping.startOffset);
      const localEnd = Math.min(mapping.originalText.length, suggestion.end - mapping.startOffset);
      
      if (localEnd > localStart) {
        extractedText += mapping.originalText.substring(localStart, localEnd);
      }
    }
    
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
export function verifySuggestionsAgainstJson(documentData: DocumentData, suggestions: ProcessedSuggestion[]): Array<{id: string, valid: boolean, error?: string, expected: string, found: string}> {
  const characterMappings = buildCharacterOffsetDict(documentData);
  const results: Array<{id: string, valid: boolean, error?: string, expected: string, found: string}> = [];
  
  for (const suggestion of suggestions) {
    // Extract text from JSON data at the specified offsets
    let extractedText = '';
    const affectedMappings = characterMappings.filter(mapping => !(suggestion.end <= mapping.startOffset || suggestion.start >= mapping.endOffset));
    
    for (const mapping of affectedMappings) {
      const localStart = Math.max(0, suggestion.start - mapping.startOffset);
      const localEnd = Math.min(mapping.originalText.length, suggestion.end - mapping.startOffset);
      
      if (localEnd > localStart) {
        extractedText += mapping.originalText.substring(localStart, localEnd);
      }
    }
    
    // For verification against JSON, we should check against the originalText for all change types
    const expectedText = suggestion.originalText;
    const isValid = extractedText === expectedText;
    
    results.push({
      id: suggestion.id,
      valid: isValid,
      expected: expectedText,
      found: extractedText,
      error: isValid ? undefined : `Text mismatch. Expected: "${expectedText}", Found: "${extractedText}"`
    });
  }
  
  return results;
}

/**
 * Export utility functions for testing and debugging
 */
import { computeTextChanges } from './documentMapping';

export const utils = {
  removeMarkupTags,
  buildCharacterOffsetDict,
  findTextDifferences,
};
