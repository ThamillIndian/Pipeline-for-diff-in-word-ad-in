import * as React from "react";
import { makeStyles } from "@fluentui/react-components";
import { suggestionsArraySchema } from "../utils/jsonSchema";
import { getRangeForOffsets } from "../utils/segmentMapping";

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
  },
});

import { verifyMapping } from "../utils/segmentMapping";

const App: React.FC = () => {
  const styles = useStyles();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<boolean>(false);
  const [suggestions, setSuggestions] = React.useState<any[]>([]);
  const [verifyResults, setVerifyResults] = React.useState<any[]>([]);

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
        const result = suggestionsArraySchema.safeParse(json);
        if (!result.success) {
          setError("Invalid JSON: " + result.error.message);
          setSuccess(false);
          return;
        }
        // Normalize all string fields in each suggestion
        const normalized = result.data.map(normalizeSuggestion);
        setSuggestions(normalized);
        setError(null);
        setSuccess(true);
        console.log(normalized);
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
          const res = await verifyMapping(context, s.start, s.end, s.text);
          results.push({ id: s.id, ...res });
        }
        setVerifyResults(results);
        setError(null);
      });
    } catch (e: any) {
      setError("Error verifying mappings: " + e.message);
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
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      {success && <div style={{ color: "green", marginTop: 8 }}>JSON loaded and validated successfully!</div>}
      {verifyResults.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Mapping Verification Results:</h4>
          <ul>
            {verifyResults.map(r => (
              <li key={r.id} style={{ color: r.matches ? 'green' : 'red' }}>
                <b>{r.id}:</b> {r.matches ? 'MATCH' : 'MISMATCH'}
                { !r.matches && (
                  <>
                    <br />Extracted: <code>{r.extracted}</code><br />Expected: <code>{suggestions.find(s => s.id === r.id)?.text}</code>
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
