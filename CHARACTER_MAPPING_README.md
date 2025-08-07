# Character Mapping for Document Diff Pipeline

This document explains the updated character mapping system designed for your specific JSON document format.

## Overview

The system now supports two JSON formats:
1. **Document Format**: Your specific paragraph-based structure
2. **Legacy Format**: Simple array of suggestions with start/end offsets

## Document Format Structure

```json
{
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
    }
  ]
}
```

## Character Offset Mapping

### Key Principles

1. **No Newline Handling**: Character offsets are calculated continuously without adding newlines between paragraphs
2. **Base Text**: Uses `original_text_no_markers` for character counting
3. **Continuous Counting**: Each paragraph's text is concatenated directly

### Example Mapping

For the sample JSON:
- Paragraph 1: "Dutch (Moroccan)" → Offsets 0-15 (length: 15)
- Paragraph 2: "22" → Offsets 15-17 (length: 2)  
- Paragraph 3: "Approach to..." → Offsets 17-98 (length: 81)

Total document text: `"Dutch (Moroccan)22Approach to Neuropsychological Assessment of Moroccan patients in the Netherlands"`

## Files and Components

### Core Utilities

1. **`documentMapping.ts`**: Core character mapping logic
   - `buildCharacterOffsetDict()`: Creates offset mappings from document data
   - `getRangeForCharacterOffsets()`: Gets Word Range for specific offsets
   - `verifyCharacterMapping()`: Validates offset mappings

2. **`jsonProcessor.ts`**: Document processing and validation
   - `processDocumentJson()`: Processes document format JSON
   - `validateCharacterOffsets()`: Validates suggestions against document
   - `convertToLegacyFormat()`: Converts to legacy suggestion format

3. **`segmentMapping.ts`**: Updated legacy functions
   - Updated to work without newline handling
   - Maintains backward compatibility

4. **`jsonSchema.ts`**: Zod schemas for validation
   - `documentSchema`: Validates document format
   - `paragraphSchema`: Validates individual paragraphs
   - `suggestionSchema`: Legacy format validation

### UI Components

**`App.tsx`**: Updated to handle both formats
- Auto-detects JSON format
- Shows format information
- Additional buttons for document format features

## Usage

### Loading Document Format JSON

1. Click "Load JSON" button
2. Select your document format JSON file
3. System automatically detects format and processes it
4. View document information and character mappings

### Available Actions

- **Extract Segment**: Highlights first suggestion in Word
- **Extract All Segments**: Highlights all suggestions
- **Verify All Mappings**: Validates text extraction
- **Show Document Info**: Displays document metadata (document format only)
- **Validate Character Offsets**: Checks offset accuracy (document format only)

### Testing

Use the test utility in `testCharacterMapping.ts`:

```typescript
// In browser console
testCharacterMapping.testWithExampleJson();
testCharacterMapping.createCompleteDocumentText();
```

## Character Offset Calculation

### Algorithm

```typescript
let currentOffset = 0;
for (const paragraph of documentData.paragraphs) {
  const textLength = paragraph.original_text_no_markers.length;
  const mapping = {
    startOffset: currentOffset,
    endOffset: currentOffset + textLength,
    // ... other properties
  };
  currentOffset += textLength; // No +1 for newlines
}
```

### Text Extraction

```typescript
function extractText(mappings, startOffset, endOffset) {
  let extractedText = '';
  for (const mapping of mappings) {
    if (rangesOverlap(startOffset, endOffset, mapping.startOffset, mapping.endOffset)) {
      const localStart = Math.max(0, startOffset - mapping.startOffset);
      const localEnd = Math.min(mapping.originalText.length, endOffset - mapping.startOffset);
      extractedText += mapping.originalText.substring(localStart, localEnd);
    }
  }
  return extractedText;
}
```

## Markup Tag Handling

The system removes markup tags when processing edited text:
- Style tags: `<{ch_head}>`, `<{byline}>`, etc.
- Formatting tags: `<[b]>`, `<[/b]>`, `<[i]>`, `<[/i]>`, etc.

## Error Handling

The system validates:
- JSON structure against schemas
- Character offset bounds
- Text extraction accuracy
- Suggestion-to-document mapping

## Debugging

Enable console logging to see:
- Character offset mappings
- Text extraction results
- Validation results
- Processing steps

## Migration from Legacy Format

Legacy suggestion arrays are still supported:
```json
[
  {
    "id": "suggestion_1",
    "text": "example text",
    "start": 0,
    "end": 12
  }
]
```

The system automatically detects the format and processes accordingly.
