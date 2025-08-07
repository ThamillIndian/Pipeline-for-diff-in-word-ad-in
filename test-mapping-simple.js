const fs = require('fs');
const path = require('path');

// Read the JSON file
const jsonPath = path.join(__dirname, 'Irani Ch 22 with synthetic errors- 2p_edited_json_157.json');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('=== Testing Character Mapping ===\n');

// Build character offset mappings
let currentOffset = 0;
const mappings = [];

for (const paragraph of jsonData.paragraphs) {
  const textLength = paragraph.original_text_no_markers.length;
  
  const mapping = {
    paragraphNumber: paragraph.paragraph_number,
    wordNativeParaId: paragraph.word_native_para_id,
    originalText: paragraph.original_text_no_markers,
    startOffset: currentOffset,
    endOffset: currentOffset + textLength,
  };

  mappings.push(mapping);
  currentOffset += textLength;
}

console.log(`Total Characters: ${currentOffset}`);

// Test the fixed suggestions
const testSuggestions = [
  { id: "test_1", text: "Dutch (Moroccan)", start: 0, end: 16 },
  { id: "test_2", text: "23", start: 16, end: 18 },
  { id: "test_3", text: "Approach", start: 18, end: 26 },
  { id: "test_4", text: "Neuropsychological", start: 30, end: 48 },
  { id: "test_5", text: "Assessment", start: 49, end: 59 },
  { id: "test_6", text: "Netherlands", start: 88, end: 99 }
];

console.log('\n=== Testing Suggestions ===');
for (const suggestion of testSuggestions) {
  let extractedText = '';
  const affectedMappings = mappings.filter(mapping => 
    !(suggestion.end <= mapping.startOffset || suggestion.start >= mapping.endOffset));
  
  for (const mapping of affectedMappings) {
    const localStart = Math.max(0, suggestion.start - mapping.startOffset);
    const localEnd = Math.min(mapping.originalText.length, suggestion.end - mapping.startOffset);
    
    if (localEnd > localStart) {
      extractedText += mapping.originalText.substring(localStart, localEnd);
    }
  }
  
  const matches = extractedText === suggestion.text;
  console.log(`\n${suggestion.id}:`);
  console.log(`  Range ${suggestion.start}-${suggestion.end}: "${extractedText}" ${matches ? '✓' : '✗'}`);
  if (!matches) {
    console.log(`  Expected: "${suggestion.text}"`);
  }
}

console.log('\n=== Paragraph Mappings ===');
mappings.slice(0, 5).forEach((mapping, idx) => {
  console.log(`\nParagraph ${idx + 1}:`);
  console.log(`  Offsets: ${mapping.startOffset}-${mapping.endOffset}`);
  console.log(`  Text: "${mapping.originalText}"`);
  console.log(`  Length: ${mapping.originalText.length} characters`);
});
