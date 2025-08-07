/**
 * Debug script to test character mapping with your JSON
 */

const fs = require('fs');
const path = require('path');

// Read the JSON file
const jsonPath = path.join(__dirname, 'Irani Ch 22 with synthetic errors- 2p_edited_json_157.json');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('=== DEBUG: Character Mapping Test ===\n');

// Build the complete text from JSON (exactly like documentMapping.ts does)
let completeText = '';
jsonData.paragraphs.forEach(paragraph => {
  completeText += paragraph.original_text_no_markers;
});

console.log(`Complete text length: ${completeText.length} characters`);
console.log(`First 100 characters: "${completeText.substring(0, 100)}..."`);
console.log(`Last 100 characters: "...${completeText.substring(completeText.length - 100)}"`);

// Test the first few suggestions
console.log('\n=== Testing Suggestions ===');

jsonData.paragraphs.forEach(paragraph => {
  if (paragraph.suggestions && paragraph.suggestions.length > 0) {
    paragraph.suggestions.forEach((suggestion, idx) => {
      const start = suggestion.start_offset;
      const end = suggestion.end_offset;
      const expectedText = suggestion.original_text;
      const extractedText = completeText.substring(start, end);
      
      console.log(`\nSuggestion ${idx + 1} in Paragraph ${paragraph.paragraph_number}:`);
      console.log(`  Offsets: ${start}-${end} (length: ${end - start})`);
      console.log(`  Expected: "${expectedText}"`);
      console.log(`  Extracted: "${extractedText}"`);
      console.log(`  Match: ${extractedText === expectedText ? '✅' : '❌'}`);
      
      if (extractedText !== expectedText) {
        console.log(`  ⚠️  MISMATCH DETECTED!`);
        console.log(`  Expected length: ${expectedText.length}`);
        console.log(`  Extracted length: ${extractedText.length}`);
      }
    });
  }
});

// Write the exact text to a file for Word testing
const exactTextPath = path.join(__dirname, 'EXACT-WORD-TEXT.txt');
fs.writeFileSync(exactTextPath, completeText, 'utf8');
console.log(`\n✅ Exact text for Word written to: ${exactTextPath}`);
console.log('\n📋 INSTRUCTIONS:');
console.log('1. Copy ALL text from EXACT-WORD-TEXT.txt');
console.log('2. Paste into Word as ONE continuous block');
console.log('3. Test the add-in again');
