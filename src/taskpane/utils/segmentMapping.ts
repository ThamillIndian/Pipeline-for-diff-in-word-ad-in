/**
 * Utilities for mapping character offsets to Word Ranges and extracting segments.
 * Updated to work with document structure without newline handling.
 */

// Legacy imports removed - these functions no longer exist in documentMapping.ts
// import { buildWordCharacterOffsetDict, getRangeForCharacterOffsets, verifyCharacterMapping, CharacterOffsetMapping } from './documentMapping';

/**
 * Build a mapping from character offsets to absolute positions in the Word document.
 * Updated version without newline handling between paragraphs.
 */
export async function buildCharOffsetDict(context: Word.RequestContext): Promise<{text: string, start: number, end: number, paragraph: Word.Paragraph, isLast: boolean}[]> {
  const paragraphs = context.document.body.paragraphs;
  paragraphs.load("items, items/text");
  await context.sync();

  let offset = 0;
  const dict: {text: string, start: number, end: number, paragraph: Word.Paragraph, isLast: boolean}[] = [];
  paragraphs.items.forEach((paragraph, idx) => {
    const len = paragraph.text.length;
    const isLast = idx === paragraphs.items.length - 1;
    dict.push({
      text: paragraph.text,
      start: offset,
      end: offset + len,
      paragraph,
      isLast
    });
    // No newline handling - continuous character counting
    offset += len;
  });
  return dict;
}

/**
 * Given start/end offsets, find and return the Word.Range covering that segment.
 * Supports multi-paragraph segments. Assumes offsets are based on normalized document text.
 */

/**
 * Verifies that the text extracted from the document for given offsets matches the JSON suggestion text.
 * Updated to work without newline handling between paragraphs.
 */
/**
 * Verifies that the text extracted from the document for given offsets matches the expected edited text.
 * Extracted: Current content in Word document
 * Expected: What it should be changed to based on JSON's latest_edited_text
 */
export async function verifyMapping(context: Word.RequestContext, start: number, end: number, expected: string) {
  const dict = await buildCharOffsetDict(context);
  let extracted = "";
  for (let i = 0; i < dict.length; i++) {
    const entry = dict[i];
    if (end <= entry.start) break;
    if (start >= entry.end) continue;
    const s = Math.max(0, start - entry.start);
    // Ensure end offset is exclusive (include up to end-1)
    let e = Math.min(entry.text.length, end - entry.start);
    // Special case: if this is the last paragraph in the range and end lands exactly at entry.end, include all
    if (end >= entry.end) e = entry.text.length;
    extracted += entry.text.slice(s, e);
    // No newline handling - continuous text extraction
  }
  const matches = extracted === expected;
  
  console.log(`Extracted: '${extracted}' | Expected: '${expected}' | Match: ${matches}`);
  return { extracted, expected, matches };
}

/**
 * Get Word Range for character offsets using the new document mapping approach
 */
export async function getRangeForOffsets(context: Word.RequestContext, start: number, end: number): Promise<Word.Range | null> {
  try {
    // Legacy function getRangeForCharacterOffsets has been removed
    // This function is no longer available - use the new correction system instead
    console.warn('getRangeForCharacterOffsets has been removed. Use processCorrectionData from documentMapping.ts instead.');
    return null;
  } catch (error) {
    console.error('Error in getRangeForOffsets:', error);
    
    // Fallback to legacy approach
    return getLegacyRangeForOffsets(context, start, end);
  }
}

/**
 * Legacy implementation as fallback
 */
async function getLegacyRangeForOffsets(context: Word.RequestContext, start: number, end: number): Promise<Word.Range | null> {
  const dict = await buildCharOffsetDict(context);
  // Handle multi-paragraph segments
  const startParaIdx = dict.findIndex(entry => start >= entry.start && start < entry.end);
  const endParaIdx = dict.findIndex(entry => end > entry.start && end <= entry.end);
  if (startParaIdx === -1 || endParaIdx === -1) {
    return null;
  }
  if (startParaIdx !== endParaIdx) {
    const ranges: Word.Range[] = [];
    for (let i = startParaIdx; i <= endParaIdx; i++) {
      const entry = dict[i];
      const paraRange = entry.paragraph.getRange();
      const paraText = entry.text;
      let s = 0, e = paraText.length;
      if (i === startParaIdx) s = start - entry.start;
      if (i === endParaIdx) e = end - entry.start;
      const substr = paraText.slice(s, e);
      // Search for the substring in this paragraph
      const searchResults = paraRange.search(substr, { matchCase: true });
      searchResults.load("items");
      await context.sync();
      if (searchResults.items.length > 0) {
        // Only highlight/select the first exact match
        const match = searchResults.items.find(r => r.text === substr);
        if (match) {
          try {
            match.font.highlightColor = '#FFD700';
            ranges.push(match);
          } catch {
            try { match.select(); } catch {}
            ranges.push(match);
          }
        }
      }
    }
    if (ranges.length > 1) {
      // Try to combine all ranges (may not work if not contiguous)
      let finalRange = ranges[0];
      for (let i = 1; i < ranges.length; i++) {
        try {
          finalRange = finalRange.expandTo(ranges[i]);
        } catch {
          // fallback: just highlight/select each separately
          return null;
        }
      }
      return finalRange;
    } else if (ranges.length === 1) {
      return ranges[0];
    }
    return null;
  } else {
    // Single paragraph: search for substring in paragraph
    const singleEntry = dict[startParaIdx];
    const singleParaRange = singleEntry.paragraph.getRange();
    const singleParaText = singleEntry.text;
    const singleS = start - singleEntry.start;
    const singleE = end - singleEntry.start;
    const singleSubstr = singleParaText.slice(singleS, singleE);
    const singleSearchResults = singleParaRange.search(singleSubstr, { matchCase: true });
    singleSearchResults.load("items");
    await context.sync();
    if (singleSearchResults.items.length > 0) {
      const singleMatch = singleSearchResults.items.find(r => r.text === singleSubstr);
      if (singleMatch) {
        try {
          singleMatch.font.highlightColor = '#FFD700';
          return singleMatch;
        } catch {
          try { singleMatch.select(); } catch {}
          return singleMatch;
        }
      }
    }
    return null;
  }
}
