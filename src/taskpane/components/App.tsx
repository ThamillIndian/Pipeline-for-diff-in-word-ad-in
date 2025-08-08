import * as React from "react";
import { makeStyles } from "@fluentui/react-components";
import { documentSchema, suggestionsArraySchema } from "../utils/jsonSchema";
import { getRangeForOffsets, verifyMapping } from "../utils/segmentMapping";
import { processDocumentJson, convertToLegacyFormat, validateCharacterOffsets, verifySuggestionsAgainstJson, ProcessedSuggestion } from "../utils/jsonProcessor";
import { verifyOriginalTextAgainstDocument, buildCharacterOffsetDict, getRangeForCharacterOffsets } from "../utils/documentMapping";

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
  },
});

const App: React.FC = () => {
  const styles = useStyles();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Add test function to window for console testing
  React.useEffect(() => {
    (window as any).testDocumentMapping = () => {
      const testJson = {
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
      
      try {
        const result = processDocumentJson(testJson);
        console.log('=== Document Processing Result ===');
        console.log('Document:', result.documentData.document_title);
        console.log('Total Characters:', result.totalCharacters);
        console.log('Character Mappings:', result.characterMappings);
        console.log('Suggestions:', result.suggestions);
        
        // Test specific character ranges
        console.log('\n=== Character Range Tests ===');
        const mappings = result.characterMappings;
        
        // Test extraction function
        const testExtract = (start: number, end: number, expected: string) => {
          let extracted = '';
          for (const mapping of mappings) {
            if (end <= mapping.startOffset || start >= mapping.endOffset) continue;
            const localStart = Math.max(0, start - mapping.startOffset);
            const localEnd = Math.min(mapping.originalText.length, end - mapping.startOffset);
            if (localEnd > localStart) {
              extracted += mapping.originalText.substring(localStart, localEnd);
            }
          }
          const match = extracted === expected;
          console.log(`${start}-${end}: "${extracted}" ${match ? '✓' : '✗'} (expected: "${expected}")`);
          return match;
        };
        
        // Test ranges
        testExtract(0, 15, 'Dutch (Moroccan)');
        testExtract(15, 17, '22');
        testExtract(17, 25, 'Approach');
        testExtract(0, 17, 'Dutch (Moroccan)22');
        
        return result;
      } catch (error) {
        console.error('Test failed:', error);
        return null;
      }
    };
  }, []);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<boolean>(false);
  const [suggestions, setSuggestions] = React.useState<any[]>([]);
  const [verifyResults, setVerifyResults] = React.useState<Array<{id: string, extracted: string, matches: boolean}>>([]);
  const [docVerifyResults, setDocVerifyResults] = React.useState<Array<{paragraphNumber: number, wordNativeParaId: string, expected: string, found: string, matches: boolean, startOffset?: number, endOffset?: number}>>([]);
  const [documentData, setDocumentData] = React.useState<any>(null);
  const [isDocumentFormat, setIsDocumentFormat] = React.useState<boolean>(false);

  const normalizeSuggestion = (s: any) => {
    if (typeof s.text === "string") {
      console.log(
        `Original: '${s.text}'`,
        Array.from(s.text).map((c: string) => c.charCodeAt(0))
      );
      const normalizedText = s.text.normalize("NFC");
      console.log(
        `Normalized: '${normalizedText}'`,
        Array.from(normalizedText).map((c: string) => c.charCodeAt(0))
      );
    }
    return {
      ...s,
      id: typeof s.id === "string" ? s.id.normalize("NFC") : s.id,
      text: typeof s.text === "string" ? s.text.normalize("NFC") : s.text,
      // Add normalization for other string fields if needed
    };
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const json = JSON.parse(text);
        
        // Try document format first
        const documentResult = documentSchema.safeParse(json);
        if (documentResult.success) {
          // Process document format
          const processingResult = processDocumentJson(json);
          const legacySuggestions = convertToLegacyFormat(processingResult.suggestions);
          
          setDocumentData(processingResult.documentData);
          setSuggestions(legacySuggestions);
          setIsDocumentFormat(true);
          setError(null);
          setSuccess(true);
          console.log('Document format processed:', processingResult);
          return;
        }
        
        // Fallback to legacy format
        const legacyResult = suggestionsArraySchema.safeParse(json);
        if (!legacyResult.success) {
          setError("Invalid JSON format. Expected either document format or legacy suggestions array: " + legacyResult.error.message);
          setSuccess(false);
          return;
        }
        
        // Normalize all string fields in each suggestion
        const normalized = legacyResult.data.map(normalizeSuggestion);
        setSuggestions(normalized);
        setDocumentData(null);
        setIsDocumentFormat(false);
        setError(null);
        setSuccess(true);
        console.log('Legacy format processed:', normalized);
      } catch (e: any) {
        setError("Failed to parse file: " + e.message);
        setSuccess(false);
      }
    });
  };

  // Extract and highlight the segment for the first suggestion
  const handleExtractSegment = async () => {
    if (!suggestions.length) {
      setError("No suggestions loaded.");
      setSuccess(false);
      return;
    }
    const { start, end } = suggestions[0];
    try {
      await Word.run(async context => {
        const range = await getRangeForOffsets(context, start, end);
        if (range) {
          range.font.highlightColor = '#FFFF00'; // yellow highlight
          context.sync();
          setError(null);
          setSuccess(true);
        } else {
          setError("Could not find segment in document (may span multiple paragraphs or offsets out of range).");
          setSuccess(false);
        }
      });
    } catch (e: any) {
      setError("Error extracting segment: " + e.message);
      setSuccess(false);
    }
  };

  // Extract and highlight all mismatched segments using fine-grained diff logic
  const handleExtractAllSegments = async () => {
    if (!documentData) {
      setError("No document data available.");
      setSuccess(false);
      return;
    }
    try {
      await Word.run(async context => {
        // Get all mismatched sections using the fine-grained diff logic
        const mismatches = await verifyOriginalTextAgainstDocument(context, documentData);
        
        if (mismatches.length === 0) {
          setError("No mismatches found to highlight.");
          setSuccess(true);
          return;
        }

        // Build character offset mappings to convert positions to Word ranges
        const characterMappings = buildCharacterOffsetDict(documentData);
        let highlightedCount = 0;

        // Load Word paragraphs for direct highlighting
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load("items");
        await context.sync();

        // Highlight each mismatch in the Word document
        for (const mismatch of mismatches) {
          try {
            // Find the corresponding Word paragraph (0-based index)
            const wordParagraphIndex = mismatch.paragraphNumber - 1;
            if (wordParagraphIndex >= 0 && wordParagraphIndex < paragraphs.items.length) {
              const wordParagraph = paragraphs.items[wordParagraphIndex];
              
              if (mismatch.startOffset !== undefined && mismatch.endOffset !== undefined) {
                // Load paragraph text to work with character positions
                wordParagraph.load('text');
                await context.sync();
                
                const paragraphText = wordParagraph.text;
                
                console.log(`\n--- Highlighting mismatch in Para ${mismatch.paragraphNumber} ---`);
              console.log(`Expected="${mismatch.expected}", Found="${mismatch.found}"`);
              console.log(`Paragraph text: "${paragraphText.substring(0, 100)}${paragraphText.length > 100 ? '...' : ''}"`);
              console.log(`Paragraph length: ${paragraphText.length}`);
              
              // Handle different types of mismatches
              if (mismatch.found === '[MISSING]') {
                // Text is missing in Word - we can't highlight what's not there
                console.log(`Cannot highlight missing text: "${mismatch.expected}" - text doesn't exist in Word`);
                // Skip highlighting for missing text but don't count as failure
                continue;
              } else if (mismatch.expected === '[EXTRA]') {
                // Extra text in Word that shouldn't be there - highlight the actual extra text
                const extraText = mismatch.found;
                console.log(`Searching for extra text to highlight: "${extraText}"`);
                
                if (extraText && extraText.trim()) {
                  // Only skip highlighting for very short text if it's a common letter
                  // Allow punctuation and meaningful short text to be highlighted
                  const isCommonLetter = /^[a-zA-Z]$/.test(extraText.trim());
                  if (extraText.trim().length === 1 && isCommonLetter) {
                    console.log(`Skipping highlight for single common letter "${extraText}" to avoid false positives`);
                    continue;
                  }
                  
                  // Use word boundary search for complete words, but allow punctuation and short meaningful text
                  const isCompleteWord = /^\w+$/.test(extraText.trim());
                  const isPunctuation = /^[^\w\s]+$/.test(extraText.trim());
                  const searchOptions = {
                    matchCase: true,
                    matchWholeWord: isCompleteWord && extraText.trim().length > 2 && !isPunctuation
                  };
                  
                  console.log(`Search options:`, searchOptions);
                  const searchResults = wordParagraph.search(extraText, searchOptions);
                  searchResults.load('items');
                  await context.sync();
                  
                  if (searchResults.items.length > 0) {
                    // For complete words, highlight all occurrences
                    // For partial text, highlight only the first occurrence to avoid false positives
                    const itemsToHighlight = isCompleteWord ? searchResults.items.length : 1;
                    
                    for (let i = 0; i < itemsToHighlight; i++) {
                      searchResults.items[i].font.highlightColor = '#ffcccc'; // Red for extra text
                    }
                    highlightedCount++;
                    console.log(`✓ Highlighted ${itemsToHighlight} instances of extra text: "${extraText}"`);
                  } else {
                    console.log(`✗ Could not find extra text "${extraText}" to highlight`);
                    console.log(`Trying fallback search without word boundaries...`);
                    
                    // Fallback: try search without word boundaries
                    const fallbackResults = wordParagraph.search(extraText, { matchCase: true, matchWholeWord: false });
                    fallbackResults.load('items');
                    await context.sync();
                    
                    if (fallbackResults.items.length > 0) {
                      fallbackResults.items[0].font.highlightColor = '#ffcccc';
                      highlightedCount++;
                      console.log(`✓ Fallback highlighting successful for: "${extraText}"`);
                    } else {
                      console.log(`✗ Fallback search also failed for: "${extraText}"`);
                    }
                  }
                }
              } else {
                // Regular text replacement - highlight the incorrect text in Word
                const incorrectText = mismatch.found;
                console.log(`Searching for incorrect text to highlight: "${incorrectText}"`);
                
                if (incorrectText && incorrectText.trim()) {
                  const searchResults = wordParagraph.search(incorrectText, { matchCase: true, matchWholeWord: false });
                  searchResults.load('items');
                  await context.sync();
                  
                  if (searchResults.items.length > 0) {
                    // Highlight the first occurrence of the incorrect text
                    searchResults.items[0].font.highlightColor = '#ffcccc'; // Red for incorrect text
                    highlightedCount++;
                    console.log(`Highlighted incorrect text: "${incorrectText}"`);
                  } else {
                    console.log(`Could not find incorrect text "${incorrectText}" to highlight`);
                  }
                }
              }  
              } else {
                // If no specific offsets, highlight the entire paragraph
                const range = wordParagraph.getRange();
                range.font.highlightColor = '#ffcccc';
                highlightedCount++;
              }
            }
          } catch (rangeError) {
            console.warn(`Could not highlight mismatch in paragraph ${mismatch.paragraphNumber}:`, rangeError);
            // Continue with other mismatches
          }
        }

        await context.sync();
        
        if (highlightedCount > 0) {
          setError(null);
          setSuccess(true);
          console.log(`Highlighted ${highlightedCount} mismatched sections in the document.`);
        } else {
          setError("No mismatched sections could be highlighted.");
          setSuccess(false);
        }
      });
    } catch (e: any) {
      setError("Error highlighting mismatched segments: " + e.message);
      setSuccess(false);
    }
  };

  // Verify all mappings
  const handleVerifyAll = async () => {
    if (!suggestions.length) {
      setVerifyResults([]);
      setError("No suggestions loaded.");
      setSuccess(false);
      return;
    }
    try {
      await Word.run(async context => {
        const results = [];
        for (const s of suggestions) {
          const res = await verifyMapping(context, s.start, s.end, s.latest_edited_text || s.text);
          results.push({ id: s.id, ...res });
        }
        setVerifyResults(results);
        setError(null);
      });
    } catch (e: any) {
      setError("Error verifying mappings: " + e.message);
    }
  };

  // Show document information
  const handleShowDocumentInfo = () => {
    if (!documentData) {
      setError("No document data available.");
      return;
    }
    
    const info = `Document Info:
- Title: ${documentData.document_title}
- Document ID: ${documentData.document_id}
- Completed Stages: ${documentData.completed_stages.join(', ')}
- Total Paragraphs: ${documentData.paragraphs.length}
- Total Suggestions: ${suggestions.length}`;
    
    // Display info in the UI instead of alert
    setError(` ${info}`);
    console.log('Document Data:', documentData);
    console.log('Document Info:', info);
  };

  // Validate character offsets
  const handleValidateOffsets = () => {
    if (!documentData || !suggestions.length) {
      setError("No document data or suggestions available.");
      return;
    }
    
    try {
      const processingResult = processDocumentJson(documentData);
      const validationResults = validateCharacterOffsets(documentData, processingResult.suggestions);
      
      const validCount = validationResults.filter(r => r.valid).length;
      const invalidCount = validationResults.length - validCount;
      
      const summary = `Validation Results:
- Valid: ${validCount}
- Invalid: ${invalidCount}
- Total: ${validationResults.length}`;
      
      setError(summary);
      console.log('Validation Results:', validationResults);
      
      if (invalidCount > 0) {
        const errors = validationResults
          .filter(r => !r.valid)
          .map(r => `${r.suggestion.id}: ${r.error}`)
          .join('\n');
        console.warn('Validation Errors:', errors);
      }
    } catch (e: any) {
      setError("Error validating offsets: " + e.message);
    }
  };

  // Run diff test with diff-match-patch
  const handleRunDiffTest = () => {
    if (!documentData || !suggestions.length) {
      setError("No document data or suggestions available.");
      return;
    }

    try {
      const processingResult = processDocumentJson(documentData);
      
      // Display diff results in the UI
      const diffInfo = `Diff Test Results:
- Total Suggestions with Changes: ${processingResult.suggestions.length}
- Check console for detailed diff information`;
      
      setError(diffInfo);
      console.log('Diff Test Results:', processingResult.suggestions);
    } catch (e: any) {
      setError("Error running diff test: " + e.message);
    }
  };

  // Verify suggestions against JSON data
  const handleVerifyAgainstJson = () => {
    if (!documentData || !suggestions.length) {
      setError("No document data or suggestions available.");
      return;
    }

    try {
      const processingResult = processDocumentJson(documentData);
      const verificationResults = verifySuggestionsAgainstJson(documentData, processingResult.suggestions);
      
      const validCount = verificationResults.filter(r => r.valid).length;
      const invalidCount = verificationResults.length - validCount;
      
      const summary = `JSON Verification Results:
- Valid: ${validCount}
- Invalid: ${invalidCount}
- Total: ${verificationResults.length}`;
      
      setError(summary);
      console.log('JSON Verification Results:', verificationResults);
      
      if (invalidCount > 0) {
        const errors = verificationResults
          .filter(r => !r.valid)
          .map(r => `${r.id}: ${r.error}`)
          .join('\n');
        console.warn('Verification Errors:', errors);
      }
      
      setError(summary);
    } catch (e: any) {
      setError("Error verifying against JSON: " + e.message);
    }
  };

  const handleVerifyAgainstDocument = async () => {
    if (!documentData) {
      setError("No document data available.");
      return;
    }

    try {
      await Word.run(async (context) => {
        const results = await verifyOriginalTextAgainstDocument(context, documentData);
        setDocVerifyResults(results);
        if (results.length > 0) {
          setError(`Found ${results.length} specific mismatch(es) between JSON and Word document. Check results below.`);
          console.warn("Specific mismatches:", results);
        } else {
          setSuccess(true);
          setError("Successfully verified against document. No mismatches found.");
        }
      });
    } catch (e: any) {
      setError("Error verifying against document: " + e.message);
    }
  };

  return (
    <div className={styles.root} style={{ padding: 24 }}>
      <h2>Diff pipeline</h2>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <button onClick={handleButtonClick}>Load JSON</button>
      <button onClick={handleExtractSegment}>Extract Segment</button>
      <button onClick={handleExtractAllSegments}>Extract All Segments</button>
      <button onClick={handleVerifyAll}>Verify All Mappings</button>
      {isDocumentFormat && (
        <>
          <button onClick={handleShowDocumentInfo}>Show Document Info</button>
          <button onClick={handleValidateOffsets}>Validate Character Offsets</button>
          <button onClick={handleRunDiffTest}>Run Diff Test</button>
          <button onClick={handleVerifyAgainstJson}>Verify Against JSON</button>
          <button onClick={handleVerifyAgainstDocument}>Verify Against Document</button>
        </>
      )}
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      {success && (
        <div style={{ color: "green", marginTop: 8 }}>
          JSON loaded and validated successfully!
          <br />
          Format: {isDocumentFormat ? 'Document Format' : 'Legacy Format'}
          {isDocumentFormat && documentData && (
            <>
              <br />
              Document: {documentData.document_title}
              <br />
              Paragraphs: {documentData.paragraphs.length}, Suggestions: {suggestions.length}
            </>
          )}
        </div>
      )}
      {verifyResults.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Mapping Verification Results:</h4>
          <ul>
            {verifyResults.map(r => (
              <li key={r.id} style={{ color: r.matches ? 'green' : 'red' }}>
                <b>{r.id}:</b> {r.matches ? 'MATCH' : 'MISMATCH'}
                { !r.matches && (
                  <>
                    <br />Extracted: <code>{r.extracted}</code><br />Expected: <code>{suggestions.find(s => s.id === r.id)?.latest_edited_text || suggestions.find(s => s.id === r.id)?.text}</code>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {docVerifyResults.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Document Verification Results:</h4>
          <p style={{ fontSize: '14px', color: '#666' }}>Showing specific character-level mismatches:</p>
          <ul>
            {docVerifyResults.map((r, index) => (
              <li key={`${r.wordNativeParaId}_${index}`} style={{ color: 'red', marginBottom: '12px' }}>
                <b>Para {r.paragraphNumber} ({r.wordNativeParaId}):</b> MISMATCH
                {r.startOffset !== undefined && r.endOffset !== undefined && (
                  <>
                    <br /><small style={{ color: '#666' }}>Character Position: {r.startOffset}-{r.endOffset}</small>
                  </>
                )}
                <br />Found (from Word): <code style={{ backgroundColor: '#ffebee', padding: '2px 4px', borderRadius: '3px' }}>{r.found}</code>
                <br />Expected (from JSON): <code style={{ backgroundColor: '#fff3e0', padding: '2px 4px', borderRadius: '3px' }}>{r.expected}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {docVerifyResults.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Document Verification Results:</h4>
          <ul>
            {docVerifyResults.map(r => (
              <li key={r.wordNativeParaId} style={{ color: r.matches ? 'green' : 'red' }}>
                <b>Para {r.paragraphNumber} ({r.wordNativeParaId}):</b> {r.matches ? 'MATCH' : 'MISMATCH'}
                { !r.matches && (
                  <>
                    <br />Expected (from Word): <code>{r.expected}</code>
                    <br />Found (from JSON): <code>{r.found}</code>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default App;
