/**
 * Test utility for character mapping with your specific JSON format
 */

import { DocumentData, ParagraphData } from './documentMapping';
import { processDocumentJson, validateCharacterOffsets } from './jsonProcessor';

/**
 * Test character mapping with the user's real JSON file
 * Call this function with your JSON data to test the pipeline
 */
export function testWithRealJsonData(realJson: any) {
  try {
    
    console.log('=== TESTING WITH REAL JSON FILE ===');
    console.log(`Document ID: ${realJson.document_id}`);
    console.log(`Document Title: ${realJson.document_title}`);
    console.log(`Total Paragraphs: ${realJson.paragraphs.length}`);
    console.log(`Completed Stages: ${realJson.completed_stages.join(', ')}`);
    
    // Test character mapping
    const mappingResult = processDocumentJson(realJson);
    console.log('\n=== CHARACTER MAPPING RESULTS ===');
    console.log(`Total characters mapped: ${mappingResult.totalCharacters}`);
    console.log(`Paragraphs processed: ${realJson.paragraphs.length}`);
    
    // Test specific paragraph mappings
    console.log('\n=== SAMPLE PARAGRAPH MAPPINGS ===');
    realJson.paragraphs.slice(0, 3).forEach((para) => {
      console.log(`\nParagraph ${para.paragraph_number} (${para.word_native_para_id}):`);
      console.log(`  Original: "${para.original_text_no_markers}"`);
      console.log(`  Length: ${para.original_text_no_markers.length} chars`);
      
      // Calculate character offset for this paragraph
      const offset = calculateCharacterOffset(realJson.paragraphs, para.paragraph_number);
      console.log(`  Character offset: ${offset}`);
    });
    
    // Test change detection
    console.log('\n=== CHANGE DETECTION ===');
    const changesDetected = realJson.paragraphs.filter(para => 
      para.latest_edited_text.includes('<{ch_head}>') || 
      para.latest_edited_text.includes('<{h2}>') ||
      para.latest_edited_text.includes('<{byline}>') ||
      para.latest_edited_text.includes('<{extract_text}>') ||
      para.latest_edited_text.includes('<{reference}>')
    );
    console.log(`Changes detected in ${changesDetected.length} paragraphs`);
    
    changesDetected.slice(0, 5).forEach(para => {
      console.log(`  - Paragraph ${para.paragraph_number}: ${para.latest_edited_text.match(/<\{[^}]+\}>/)?.[0] || 'Unknown change'}`);
    });
    
    return {
      success: true,
      documentId: realJson.document_id,
      totalParagraphs: realJson.paragraphs.length,
      changesDetected: changesDetected.length,
      mappingResult
    };
    
  } catch (error) {
    console.error('Error testing with real JSON data:', error);
    return { success: false, error: error.message };
  }
}



/**
 * Helper function to calculate character offset for a specific paragraph
 */
function calculateCharacterOffset(paragraphs: any[], targetParagraphNumber: number): number {
  let offset = 0;
  for (const para of paragraphs) {
    if (para.paragraph_number >= targetParagraphNumber) break;
    offset += para.original_text_no_markers.length;
  }
  return offset;
}

/**
 * Test character mapping with the provided JSON example
 */
export function testWithExampleJson() {
  const exampleJson = {
    "document_id": 157,
    "document_title": "Test Project KGL T&F - 2025-05-24 16:40",
    "completed_stages": ["preworkout", "language-edit"],
    "paragraphs": [
      {
        "paragraph_number": 1,
        "word_native_para_id": "36E7A870",
        "original_text_no_markers": "Dutch (Moroccan)",
        "input_with_markers": "<[i]><[b]>Dutch (Moroccan)<[/b]><[/i]>",
        "latest_edited_text": "<{ch_head}> <[i]><[b]>Dutch (Moroccan)<[/b]><[/i]>"
      },
      {
        "paragraph_number": 2,
        "word_native_para_id": "70359924",
        "original_text_no_markers": "22",
        "input_with_markers": "<[b]>22<[/b]>",
        "latest_edited_text": "<{ch_head}> <[b]>22<[/b]>"
      },
      {
        "paragraph_number": 3,
        "word_native_para_id": "5340ECB8",
        "original_text_no_markers": "Approach to Neuropsychological Assessment of Moroccan patients in the Netherlands",
        "input_with_markers": "<[b]>Approach to Neuropsychological Assessment of Moroccan patients in the Netherlands<[/b]>",
        "latest_edited_text": "<{ch_head}> <[b]>Approach to Neuropsychological Assessment of Moroccan patients in the Netherlands<[/b]>"
      }
    ]
  };

  console.log('=== Testing Character Mapping ===');
  
  try {
    // Process the document
    const result = processDocumentJson(exampleJson);
    console.log('Processing Result:', result);
    
    // Build character mappings
    // Legacy character mapping test removed - buildCharacterOffsetDict function no longer exists
    // The new system uses processCorrectionData for granular correction generation
    console.log('\n=== New Correction System Test ===');
    console.log('Note: Legacy character mapping functions have been replaced with granular correction system.');
    console.log('Use processCorrectionData from documentMapping.ts for the new workflow.');
    
    // Validate all suggestions
    if (result.suggestions.length > 0) {
      console.log('\n=== Validating Suggestions ===');
      const validationResults = validateCharacterOffsets(result.documentData, result.suggestions);
      validationResults.forEach(validation => {
        console.log(`${validation.suggestion.id}: ${validation.valid ? 'VALID' : 'INVALID'}`);
        if (!validation.valid) {
          console.log(`  Error: ${validation.error}`);
        }
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

/**
 * Test text extraction for a specific range
 */
function testExtraction(mappings: any[], startOffset: number, endOffset: number, expectedText: string) {
  let extractedText = '';
  
  for (const mapping of mappings) {
    if (endOffset <= mapping.startOffset || startOffset >= mapping.endOffset) {
      continue; // No overlap
    }
    
    const localStart = Math.max(0, startOffset - mapping.startOffset);
    const localEnd = Math.min(mapping.originalText.length, endOffset - mapping.startOffset);
    
    if (localEnd > localStart) {
      extractedText += mapping.originalText.substring(localStart, localEnd);
    }
  }
  
  const matches = extractedText === expectedText;
  console.log(`Range ${startOffset}-${endOffset}: "${extractedText}" ${matches ? '✓' : '✗'}`);
  if (!matches) {
    console.log(`  Expected: "${expectedText}"`);
  }
}

/**
 * Generate test suggestions for specific text segments
 */
export function generateTestSuggestions() {
  return [
    { id: "test_1", text: "Dutch (Moroccan)", start: 0, end: 16 },
    { id: "test_2", text: "22", start: 16, end: 18 },
    { id: "test_3", text: "Approach", start: 18, end: 26 },
    { id: "test_4", text: "Neuropsychological", start: 30, end: 48 },
    { id: "test_5", text: "Assessment", start: 49, end: 59 },
    { id: "test_6", text: "Netherlands", start: 88, end: 99 }
  ];
}

/**
 * Create a complete document text for reference
 */
export function createCompleteDocumentText() {
  const paragraphs = [
    "Dutch (Moroccan)",
    "23", 
    "Approach to Neuropsychological Assessment of Moroccan patients in the Netherlands"
  ];
  
  // Join without newlines as per your requirement
  const completeText = paragraphs.join('');
  
  console.log('Complete Document Text:');
  console.log(`"${completeText}"`);
  console.log(`Total length: ${completeText.length}`);
  
  // Show character positions
  let offset = 0;
  paragraphs.forEach((paragraph, index) => {
    console.log(`Paragraph ${index + 1}: ${offset}-${offset + paragraph.length} "${paragraph}"`);
    offset += paragraph.length;
  });
  
  return completeText;
}

// Export for console testing
if (typeof window !== 'undefined') {
  (window as any).testCharacterMapping = {
    testWithExampleJson,
    generateTestSuggestions,
    createCompleteDocumentText
  };
}
