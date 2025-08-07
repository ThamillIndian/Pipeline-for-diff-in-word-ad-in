import * as React from "react";
import { makeStyles } from "@fluentui/react-components";
import { documentSchema, suggestionsArraySchema } from "../utils/jsonSchema";
import { getRangeForOffsets, verifyMapping } from "../utils/segmentMapping";
import { processDocumentJson, convertToLegacyFormat, validateCharacterOffsets, verifySuggestionsAgainstJson, ProcessedSuggestion } from "../utils/jsonProcessor";

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
  const [verifyResults, setVerifyResults] = React.useState<any[]>([]);
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

  // Extract and highlight all segments
  const handleExtractAllSegments = async () => {
    if (!suggestions.length) {
      setError("No suggestions loaded.");
      setSuccess(false);
      return;
    }
    try {
      await Word.run(async context => {
        let anySuccess = false;
        for (const s of suggestions) {
          const range = await getRangeForOffsets(context, s.start, s.end);
          if (range) anySuccess = true;
        }
        await context.sync();
        if (anySuccess) {
          setError(null);
          setSuccess(true);
        } else {
          setError("No segments could be extracted/highlighted.");
          setSuccess(false);
        }
      });
    } catch (e: any) {
      setError("Error extracting segments: " + e.message);
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
    </div>
  );
};

export default App;
