const fs = require('fs');
const path = require('path');

// Read the JSON file
const jsonPath = path.join(__dirname, 'Irani Ch 22 with synthetic errors- 2p_edited_json_157.json');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

let output = '=== DEBUG: Diff Pipeline Test ===\n\n';

// Simulate the processing logic
output += `Document: ${jsonData.document_title}\n`;
output += `Document ID: ${jsonData.document_id}\n`;
output += `Paragraphs: ${jsonData.paragraphs.length}\n`;

// Build character offset mappings (like buildCharacterOffsetDict)
let currentOffset = 0;
const mappings = [];

for (const paragraph of jsonData.paragraphs) {
  // Use original_text_no_markers for character counting as it's the base text
  const textLength = paragraph.original_text_no_markers.length;
  
  const mapping = {
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

output += `Total Characters: ${currentOffset}\n`;

// Build complete text
let completeText = '';
mappings.forEach(mapping => {
  completeText += mapping.originalText;
});

output += `Complete text length: ${completeText.length} characters\n`;

// Show first few paragraphs with differences
output += '\n=== Paragraphs with Differences ===\n';
const paragraphsWithDifferences = [];

jsonData.paragraphs.slice(0, 5).forEach((paragraph, idx) => {
  // Remove markup tags from latest_edited_text
  const cleanEdited = paragraph.latest_edited_text
    .replace(/<\{[^}]+\}>\s*/g, '') // Remove style tags like <{ch_head}>
    .replace(/<\[[^\]]+\]>/g, '') // Remove formatting tags like <[b]>, <[/b]>
    .trim();
  
  const original = paragraph.original_text_no_markers;
  
  output += `\nParagraph ${idx + 1} (ID: ${paragraph.word_native_para_id}):\n`;
  output += `  Original: "${original}"\n`;
  output += `  Edited: "${cleanEdited}"\n`;
  output += `  Same: ${original === cleanEdited}\n`;
  
  if (original !== cleanEdited) {
    paragraphsWithDifferences.push({
      paragraphNumber: paragraph.paragraph_number,
      wordNativeParaId: paragraph.word_native_para_id,
      originalText: original,
      editedText: cleanEdited,
      startOffset: mappings[idx].startOffset,
      endOffset: mappings[idx].endOffset
    });
  }
});

// Show mappings for paragraphs with differences
output += '\n=== Mappings for Paragraphs with Differences ===\n';
paragraphsWithDifferences.forEach((diff, idx) => {
  output += `\nDifference ${idx + 1}:\n`;
  output += `  Paragraph: ${diff.paragraphNumber}\n`;
  output += `  ID: ${diff.wordNativeParaId}\n`;
  output += `  Offsets: ${diff.startOffset}-${diff.endOffset}\n`;
  output += `  Original: "${diff.originalText}"\n`;
  output += `  Edited: "${diff.editedText}"\n`;
  
  // Test extraction of the entire paragraph
  let extractedText = '';
  const affectedMappings = mappings.filter(mapping => 
    !(diff.endOffset <= mapping.startOffset || diff.startOffset >= mapping.endOffset));
  
  for (const mapping of affectedMappings) {
    const localStart = Math.max(0, diff.startOffset - mapping.startOffset);
    const localEnd = Math.min(mapping.originalText.length, diff.endOffset - mapping.startOffset);
    
    if (localEnd > localStart) {
      extractedText += mapping.originalText.substring(localStart, localEnd);
    }
  }
  
  output += `  Extracted: "${extractedText}"\n`;
  output += `  Match: ${extractedText === diff.originalText ? '✅' : '❌'}\n`;
});

// Test extraction for specific character ranges that should work
output += '\n=== Testing Specific Character Range Extraction ===\n';

// Test ranges based on actual mappings
const testRanges = [
  { start: 0, end: 16, expected: 'Dutch (Moroccan)' }, // Full first paragraph
  { start: 16, end: 18, expected: '23' }, // Full second paragraph
  { start: 18, end: 99, expected: 'Approach to Neuropsychological Assessment of Moroccan patients in the Netherlands' }, // Full third paragraph
  { start: 0, end: 18, expected: 'Dutch (Moroccan)23' }, // First two paragraphs
];

for (const range of testRanges) {
  let extractedText = '';
  const affectedMappings = mappings.filter(mapping => 
    !(range.end <= mapping.startOffset || range.start >= mapping.endOffset));
  
  for (const mapping of affectedMappings) {
    const localStart = Math.max(0, range.start - mapping.startOffset);
    const localEnd = Math.min(mapping.originalText.length, range.end - mapping.startOffset);
    
    if (localEnd > localStart) {
      extractedText += mapping.originalText.substring(localStart, localEnd);
    }
  }
  
  output += `\nRange ${range.start}-${range.end}:\n`;
  output += `  Expected: "${range.expected}"\n`;
  output += `  Extracted: "${extractedText}"\n`;
  output += `  Match: ${extractedText === range.expected ? '✅' : '❌'}\n`;
  
  if (extractedText !== range.expected) {
    output += `  ⚠️  MISMATCH DETECTED!\n`;
    output += `  Expected length: ${range.expected.length}\n`;
    output += `  Extracted length: ${extractedText.length}\n`;
    output += `  Expected char codes: [${Array.from(range.expected).map(c => c.charCodeAt(0)).join(', ')}]\n`;
    output += `  Extracted char codes: [${Array.from(extractedText).map(c => c.charCodeAt(0)).join(', ')}]\n`;
  }
}

// Write output to file
const outputPath = path.join(__dirname, 'debug-output.txt');
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Debug output written to: ${outputPath}`);
