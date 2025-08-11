/**
 * Document mapping utilities for granular Word Document correction review
 * Core engine for character-level diff and correction generation
 */

import { documentSchema, paragraphSchema } from './jsonSchema';
import { z } from 'zod';
import { diff_match_patch } from 'diff-match-patch';

export type DocumentData = z.infer<typeof documentSchema>;
export type ParagraphData = z.infer<typeof paragraphSchema>;



/**
 * Remove markup tags from text for clean comparison
 */
function removeMarkupTags(text: string): string {
  // Remove tags like <{tag_name}>, <[tag]>, <[/tag]>, and [tag] without angle brackets
  return text
    .replace(/<\{[^}]+\}>\s*/g, '') // Remove style tags like <{ch_head}>
    .replace(/<\[[^\]]+\]>/g, '') // Remove formatting tags like <[b]>, <[/b]>
    .replace(/\[[^\]]+\]/g, '') // Remove tags without angle brackets like [endash], [emdash]
    .trim();
}



// ============================================================================
// NEW INTERACTIVE CORRECTION REVIEW SYSTEM
// ============================================================================

/**
 * Represents a single correction that can be applied to the document
 */
export interface CorrectionObject {
  id: string;
  paragraphNumber: number;
  wordNativeParaId: string;
  originalText: string;        // Clean text from Word document
  correctedText: string;       // Clean text from JSON latest_edited_text
  changeType: 'addition' | 'deletion' | 'modification';
  startOffset: number;         // Character offset within paragraph
  endOffset: number;           // Character offset within paragraph
  wordRange?: Word.Range;      // Mapped Word document range
  status: 'pending' | 'applied' | 'rejected' | 'skipped';
  diffText: string;            // The specific text that changed
  suggestion: string;          // Human-readable suggestion like "apple (remove l)"
  actionDescription: string;   // Description of the action like "remove l", "add s", "change to 'apple'"
  errorType: 'Missing' | 'Extra' | 'Modified'; // Grammarly-style error categorization
}

/**
 * Generate Grammarly-style suggestion text for a correction
 * Provides clear, actionable feedback with context
 */
function generateGrammarlyStyleSuggestion(
  errorType: 'Missing' | 'Extra' | 'Modified',
  diffText: string,
  wordText: string,
  _jsonCorrectedText: string,
  startOffset: number,
  endOffset: number
): string {
  const contextRadius = 15;
  
  if (errorType === 'Missing') {
    // Text should be added to Word document
    const _beforeContext = wordText.substring(Math.max(0, startOffset - contextRadius), startOffset);
    const _afterContext = wordText.substring(startOffset, Math.min(wordText.length, startOffset + contextRadius));
    
    if (diffText.length === 1) {
      // Single character addition
      return `Add "${diffText}"`;
    } else if (diffText.trim() === ',') {
      return `Add comma`;
    } else if (diffText.trim() === '.') {
      return `Add period`;
    } else {
      return `Add "${diffText.trim()}"`;
    }
  } else if (errorType === 'Extra') {
    // Text should be removed from Word document
    const _beforeContext = wordText.substring(Math.max(0, startOffset - contextRadius), startOffset);
    const _afterContext = wordText.substring(endOffset, Math.min(wordText.length, endOffset + contextRadius));
    
    if (diffText.length === 1) {
      // Single character removal
      return `Remove "${diffText}"`;
    } else {
      return `Remove "${diffText.trim()}"`;
    }
  } else {
    // Modified text
    return `Change "${diffText.trim()}"`;
  }
}

/**
 * Generate human-readable suggestion text for a correction (legacy function)
 * Focus on the specific changed part, not the entire paragraph
 */
function generateCorrectionSuggestion(
  originalText: string,
  _correctedText: string,
  changeType: 'addition' | 'deletion' | 'modification',
  diffText: string,
  startOffset: number,
  endOffset: number
): { suggestion: string; actionDescription: string } {
  const contextRadius = 20;
  const beforeContext = originalText.substring(Math.max(0, startOffset - contextRadius), startOffset);
  const afterContext = originalText.substring(endOffset, Math.min(originalText.length, endOffset + contextRadius));
  
  let suggestion = '';
  let actionDescription = '';
  
  if (changeType === 'deletion') {
    suggestion = `Remove "${diffText}"`;
    actionDescription = `remove "${diffText}"`;
  } else if (changeType === 'addition') {
    suggestion = `Add "${diffText}"`;
    actionDescription = `add "${diffText}"`;
  } else if (changeType === 'modification') {
    // For modifications, we need to determine what to replace with
    suggestion = `Change "${diffText}"`;
    actionDescription = `change "${diffText}"`;
  } else {
    // Default fallback case
    suggestion = `Change "${diffText}"`;
    actionDescription = `change "${diffText}"`;
  }
  
  // Add context if available
  if (beforeContext || afterContext) {
    const contextStr = `${beforeContext}[${diffText}]${afterContext}`;
    suggestion += ` in "${contextStr}"`;
  }
  
  return { suggestion, actionDescription };
}

/**
 * Process document data to generate correction objects for interactive review
 * Maps paragraphs by original_text_no_markers and performs character-level diff
 */
export async function processCorrectionData(
  context: Word.RequestContext,
  documentData: DocumentData
): Promise<CorrectionObject[]> {
  const paragraphs = context.document.body.paragraphs;
  paragraphs.load("items/text");
  await context.sync();

  const corrections: CorrectionObject[] = [];

  console.log('\n=== CHARACTER-LEVEL DIFF PROCESSING ===');
  console.log(`Total JSON paragraphs: ${documentData.paragraphs.length}`);
  console.log(`Total Word paragraphs: ${paragraphs.items.length}`);

  for (const jsonParagraph of documentData.paragraphs) {
    console.log(`\n--- Processing Paragraph ${jsonParagraph.paragraph_number} ---`);
    console.log(`JSON original_text_no_markers: "${jsonParagraph.original_text_no_markers}"`);
    console.log(`JSON latest_edited_text (raw): "${jsonParagraph.latest_edited_text}"`);
    
    // Step 1: Map paragraph by original_text_no_markers
    let wordParagraph = await findWordParagraphByText(
      paragraphs.items, 
      jsonParagraph.original_text_no_markers
    );

    // Fallback: Use paragraph index if text-based mapping fails
    if (!wordParagraph) {
      const paragraphIndex = jsonParagraph.paragraph_number - 1;
      if (paragraphIndex >= 0 && paragraphIndex < paragraphs.items.length) {
        wordParagraph = paragraphs.items[paragraphIndex];
        console.log(`🔄 Using index-based fallback for paragraph ${jsonParagraph.paragraph_number}`);
        console.log(`   Mapped to Word paragraph [${paragraphIndex}]: "${wordParagraph.text.trim().substring(0, 80)}..."`);
      } else {
        console.log(`❌ Could not map paragraph ${jsonParagraph.paragraph_number} - index out of bounds`);
        console.log(`   Looking for: "${jsonParagraph.original_text_no_markers}"`);
        console.log(`   Available Word paragraphs: ${paragraphs.items.length}`);
        continue;
      }
    }

    console.log(`✅ Mapped paragraph ${jsonParagraph.paragraph_number} successfully`);

    // Step 2: Get texts for comparison
    const wordText = wordParagraph.text.trim();
    const jsonCorrectedText = removeMarkupTags(jsonParagraph.latest_edited_text).trim();
    
    console.log(`📄 Word document text: "${wordText}"`);
    console.log(`✏️  JSON corrected text: "${jsonCorrectedText}"`);
    console.log(`🔍 Are they identical? ${wordText === jsonCorrectedText}`);

    // Step 3: Skip if texts are identical
    if (wordText === jsonCorrectedText) {
      console.log('✓ No differences found - texts are identical');
      continue;
    }

    console.log(`🔄 Texts differ - creating granular error corrections...`);

    // Step 4: Create individual corrections for each specific change
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(wordText, jsonCorrectedText);
    dmp.diff_cleanupSemantic(diffs);
    dmp.diff_cleanupEfficiency(diffs);
    
    console.log(`📊 Found ${diffs.length} diff operations for paragraph ${jsonParagraph.paragraph_number}`);
    
    // Track position in original text for offset calculation
    let currentOffset = 0;
    let correctionIndex = 0;
    
    for (const [operation, text] of diffs) {
      if (operation === 0) {
        // Equal text - just advance the offset
        currentOffset += text.length;
        continue;
      }
      
      correctionIndex++;
      const correctionId = `${jsonParagraph.word_native_para_id}-error-${correctionIndex}`;
      
      let changeType: 'addition' | 'deletion' | 'modification';
      let suggestion: string;
      let actionDescription: string;
      let errorType: 'Missing' | 'Extra' | 'Modified';
      let diffText: string;
      let startOffset: number;
      let endOffset: number;
      
      if (operation === -1) {
        // Deletion
        changeType = 'deletion';
        errorType = 'Extra';
        diffText = text;
        startOffset = currentOffset;
        endOffset = currentOffset + text.length;
        suggestion = `Delete "${text.trim()}"`;
        actionDescription = `Remove extra text: "${text.trim()}"`;
        
        // Advance offset for deleted text
        currentOffset += text.length;
      } else if (operation === 1) {
        // Addition
        changeType = 'addition';
        errorType = 'Missing';
        diffText = text;
        startOffset = currentOffset;
        endOffset = currentOffset; // Addition has zero-width in original
        suggestion = `Add "${text.trim()}"`;
        actionDescription = `Insert missing text: "${text.trim()}"`;
        
        // Don't advance offset for additions (they don't exist in original)
      }
      
      const correction: CorrectionObject = {
        id: correctionId,
        paragraphNumber: jsonParagraph.paragraph_number,
        wordNativeParaId: jsonParagraph.word_native_para_id,
        originalText: wordText,
        correctedText: jsonCorrectedText,
        changeType: changeType!,
        startOffset: startOffset!,
        endOffset: endOffset!,
        status: 'pending',
        diffText: diffText!,
        suggestion: suggestion!,
        actionDescription: actionDescription!,
        errorType: errorType!
      };

      corrections.push(correction);
      console.log(`✅ Created ${changeType} correction: "${suggestion}" at offset ${startOffset}-${endOffset}`);
    }
    
    console.log(`📝 Created ${correctionIndex} individual corrections for paragraph ${jsonParagraph.paragraph_number}`);
  }

  console.log(`\n=== Processing Complete: Created ${corrections.length} corrections ===`);
  return corrections;
}

/**
 * Find Word paragraph that matches the given text content
 */
async function findWordParagraphByText(
  wordParagraphs: Word.Paragraph[],
  targetText: string
): Promise<Word.Paragraph | null> {
  const normalizedTarget = targetText.trim().replace(/\s+/g, ' ');
  
  // First try: Exact match
  for (const paragraph of wordParagraphs) {
    const paragraphText = paragraph.text.trim().replace(/\s+/g, ' ');
    if (paragraphText === normalizedTarget) {
      console.log(`✅ Found exact match for: "${normalizedTarget.substring(0, 50)}..."`);
      return paragraph;
    }
  }
  
  // Second try: Partial match (contains significant portion)
  console.log(`⚠️ No exact match found for: "${normalizedTarget}"`);
  console.log(`🔍 Trying partial matching...`);
  
  for (const paragraph of wordParagraphs) {
    const paragraphText = paragraph.text.trim().replace(/\s+/g, ' ');
    
    // Check if paragraph contains at least 80% of the target text (word-based)
    const targetWords = normalizedTarget.split(' ');
    const paragraphWords = paragraphText.split(' ');
    
    if (targetWords.length > 5) { // Only for longer paragraphs
      const matchingWords = targetWords.filter(word => 
        paragraphWords.some(pWord => pWord.toLowerCase().includes(word.toLowerCase()))
      );
      
      const matchPercentage = matchingWords.length / targetWords.length;
      if (matchPercentage >= 0.8) {
        console.log(`📍 Found partial match (${Math.round(matchPercentage * 100)}%): "${paragraphText.substring(0, 50)}..."`);
        return paragraph;
      }
    }
  }
  
  console.log(`❌ No suitable match found`);
  return null;
}

/**
 * Create a Word.Range for a specific correction within a paragraph
 */
async function createWordRangeForCorrection(
  _context: Word.RequestContext,
  wordParagraph: Word.Paragraph,
  correction: CorrectionObject
): Promise<Word.Range | null> {
  try {
    // For now, return the entire paragraph range
    // TODO: Implement precise character-level range mapping using correction.startOffset and correction.endOffset
    console.log(`Creating range for correction: ${correction.changeType} at ${correction.startOffset}-${correction.endOffset}`);
    return wordParagraph.getRange();
  } catch (error) {
    console.error('Error creating Word range:', error);
    return null;
  }
}
