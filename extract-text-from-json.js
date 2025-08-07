/**
 * Extract the exact text content from JSON file to match character offsets
 */

const fs = require('fs');
const path = require('path');

// Read the JSON file
const jsonPath = path.join(__dirname, 'test-document.json');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Extract original_text_no_markers from all paragraphs in order
let completeText = '';
let currentOffset = 0;

console.log('=== Extracting Text from JSON ===');
console.log(`Document: ${jsonData.document_title}`);
console.log(`Total paragraphs: ${jsonData.paragraphs.length}\n`);

jsonData.paragraphs.forEach((paragraph, index) => {
  const text = paragraph.original_text_no_markers;
  const startOffset = currentOffset;
  const endOffset = currentOffset + text.length;
  
  console.log(`Paragraph ${paragraph.paragraph_number} (${paragraph.word_native_para_id}):`);
  console.log(`  Text: "${text}"`);
  console.log(`  Offsets: ${startOffset}-${endOffset} (length: ${text.length})`);
  
  completeText += text;
  currentOffset += text.length;
});

console.log(`\n=== Complete Document Text ===`);
console.log(`Total length: ${completeText.length} characters`);
console.log(`Text: "${completeText}"`);

// Write the correct text to a file
const outputPath = path.join(__dirname, 'test-document-exact.txt');
fs.writeFileSync(outputPath, completeText, 'utf8');

console.log(`\n✅ Exact text written to: ${outputPath}`);

// Generate character offset test cases
console.log(`\n=== Test Cases for Character Offsets ===`);
let offset = 0;
jsonData.paragraphs.slice(0, 5).forEach((paragraph) => {
  const text = paragraph.original_text_no_markers;
  const start = offset;
  const end = offset + text.length;
  
  console.log(`// Test paragraph ${paragraph.paragraph_number}`);
  console.log(`testExtract(${start}, ${end}, '${text.replace(/'/g, "\\'")}');`);
  
  offset += text.length;
});
