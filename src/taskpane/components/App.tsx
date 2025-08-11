import * as React from "react";
import { useState, useRef } from "react";
import { documentSchema, suggestionsArraySchema } from "../utils/jsonSchema";
import { getRangeForOffsets, verifyMapping } from "../utils/segmentMapping";
import { processDocumentJson, convertToLegacyFormat, validateCharacterOffsets, verifySuggestionsAgainstJson, ProcessedSuggestion } from '../utils/jsonProcessor';
import { processCorrectionData, CorrectionObject } from '../utils/documentMapping';
import { correctionReviewManager, ReviewProgress } from '../utils/correctionReviewManager';
// Legacy imports removed - these functions no longer exist in documentMapping.ts
// import { buildCharacterOffsetDict, getRangeForCharacterOffsets } from "../utils/documentMapping";

// Simple button styles
const buttonStyle = {
  padding: '8px 16px',
  margin: '4px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  cursor: 'pointer',
  backgroundColor: '#f8f9fa'
};

const primaryButtonStyle = {
  ...buttonStyle,
  backgroundColor: '#0078d4',
  color: 'white',
  border: '1px solid #0078d4'
};

const dangerButtonStyle = {
  ...buttonStyle,
  backgroundColor: '#d13438',
  color: 'white',
  border: '1px solid #d13438'
};

const successButtonStyle = {
  ...buttonStyle,
  backgroundColor: '#107c10',
  color: 'white',
  border: '1px solid #107c10'
};

const App: React.FC<{}> = () => {
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
        // Legacy characterMappings property removed
        // console.log('Character Mappings:', result.characterMappings);
        console.log('Suggestions:', result.suggestions);
        
        // Test specific character ranges
        console.log('\n=== Character Range Tests ===');
        // Legacy characterMappings property removed - use processCorrectionData instead
        // const mappings = result.characterMappings;
        console.log('Legacy character mappings removed. Use processCorrectionData for new correction workflow.');
        
        // Legacy test extraction function removed - mappings no longer available
        const testExtract = (start: number, end: number, expected: string) => {
          console.log(`Legacy testExtract function called for range ${start}-${end}`);
          console.log('Character mappings no longer available. Use processCorrectionData instead.');
          const match = false; // Always false since legacy function is non-functional
          console.log(`${start}-${end}: "Legacy function disabled" ✗ (expected: "${expected}")`);
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

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [corrections, setCorrections] = useState<CorrectionObject[]>([]);
  const [isReviewActive, setIsReviewActive] = useState(false);
  const [currentCorrection, setCurrentCorrection] = useState<CorrectionObject | null>(null);
  const [reviewProgress, setReviewProgress] = useState<ReviewProgress>({ current: 0, total: 0, applied: 0, rejected: 0, skipped: 0, pending: 0 });
  const [documentData, setDocumentData] = useState<any>(null);
  const [animatingCorrections, setAnimatingCorrections] = useState<Set<string>>(new Set());

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
        
        // Parse as document format
        const documentResult = documentSchema.safeParse(json);
        if (documentResult.success) {
          setDocumentData(json);
          setError(null);
          setSuccess(true);
          setMessage("JSON loaded successfully. Click 'Start Review' to find corrections.");
          console.log('Document format loaded:', json.document_title);
        } else {
          setError("Invalid JSON format. Expected document format: " + documentResult.error.message);
          setSuccess(false);
        }
      } catch (e: any) {
        setError("Failed to parse file: " + e.message);
        setSuccess(false);
      }
    });
  };



  // Highlight the current correction in the Word document
  const highlightCurrentCorrection = async (correction: CorrectionObject) => {
    try {
      await Word.run(async context => {
        if (correction.wordRange) {
          // Clear previous highlights by removing formatting
          const allRanges = context.document.body.getRange();
          allRanges.font.highlightColor = null;
          
          // Apply highlight to current correction
          correction.wordRange.font.highlightColor = '#ffeb3b'; // Yellow highlight
          correction.wordRange.font.underline = Word.UnderlineType.single;
          
          await context.sync();
          console.log(`Highlighted correction: ${correction.changeType} "${correction.diffText}"`);
        }
      });
    } catch (error) {
      console.error('Error highlighting correction:', error);
    }
  };

  // Removed duplicate function declarations - handlers are defined below

  // Handle applying specific correction by ID with smooth animation
  const handleApplySpecificCorrection = async (correctionId: string) => {
    // Start fade-out animation
    setAnimatingCorrections(prev => new Set(Array.from(prev)).add(correctionId));
    
    // Wait for animation to start
    setTimeout(async () => {
      if (correctionReviewManager) {
        try {
          const success = await correctionReviewManager.applySpecificCorrection(correctionId);
          if (success) {
            setMessage(`Correction applied successfully!`);
            setError("");
            
            // Update the corrections state to reflect the change
            setCorrections(prev => 
              prev.map(c => 
                c.id === correctionId 
                  ? { ...c, status: 'applied' as const }
                  : c
              )
            );
          } else {
            setError(`Failed to apply correction`);
          }
        } catch (error: any) {
          setError(`Error applying correction: ${error.message}`);
        }
        
        // Remove from animating set after successful application
        setTimeout(() => {
          setAnimatingCorrections(prev => {
            const newSet = new Set(Array.from(prev));
            newSet.delete(correctionId);
            return newSet;
          });
        }, 300); // Match CSS transition duration
      }
    }, 150); // Small delay for smooth UX
  };

  // Handle rejecting specific correction by ID with smooth animation
  const handleRejectSpecificCorrection = async (correctionId: string) => {
    // Start fade-out animation
    setAnimatingCorrections(prev => new Set(Array.from(prev)).add(correctionId));
    
    // Wait for animation to start
    setTimeout(async () => {
      if (correctionReviewManager) {
        try {
          const success = await correctionReviewManager.rejectSpecificCorrection(correctionId);
          if (success) {
            setMessage(`Correction rejected`);
            setError("");
            
            // Update the corrections state to reflect the change
            setCorrections(prev => 
              prev.map(c => 
                c.id === correctionId 
                  ? { ...c, status: 'rejected' as const }
                  : c
              )
            );
          } else {
            setError(`Failed to reject correction`);
          }
        } catch (error: any) {
          setError(`Error rejecting correction: ${error.message}`);
        }
        
        // Remove from animating set after successful rejection
        setTimeout(() => {
          setAnimatingCorrections(prev => {
            const newSet = new Set(Array.from(prev));
            newSet.delete(correctionId);
            return newSet;
          });
        }, 300); // Match CSS transition duration
      }
    }, 150); // Small delay for smooth UX
  };

  // Handle applying all pending corrections
  const handleApplyAllCorrections = async () => {
    if (correctionReviewManager) {
      await correctionReviewManager.applyAllPendingCorrections();
    }
  };

  // Handle rejecting all pending corrections
  const handleRejectAllCorrections = async () => {
    if (correctionReviewManager) {
      await correctionReviewManager.rejectAllPendingCorrections();
    }
  };

  // Legacy handlers (kept for compatibility)
  const handleApplyCorrection = async () => {
    if (correctionReviewManager) {
      await correctionReviewManager.applyCurrentCorrection();
    }
  };

  const handleRejectCorrection = async () => {
    if (correctionReviewManager) {
      await correctionReviewManager.rejectCurrentCorrection();
    }
  };

  const handleSkipCorrection = async () => {
    if (correctionReviewManager) {
      await correctionReviewManager.skipCurrentCorrection();
    }
  };

  const handlePreviousCorrection = async () => {
    if (correctionReviewManager) {
      await correctionReviewManager.previousCorrection();
    }
  };

  const handleNextCorrection = async () => {
    if (correctionReviewManager) {
      await correctionReviewManager.nextCorrection();
    }
  };

  // End review session
  const handleEndReview = () => {
    const finalStats = correctionReviewManager.endReview();
    setIsReviewActive(false);
    setCurrentCorrection(null);
    setMessage(`Review completed. Applied: ${finalStats.applied}, Rejected: ${finalStats.rejected}, Skipped: ${finalStats.skipped}`);
    setSuccess(true);
    setError('');
    
    // Clear all highlights
    Word.run(async context => {
      const allRanges = context.document.body.getRange();
      allRanges.font.highlightColor = null;
      allRanges.font.underline = Word.UnderlineType.none;
      await context.sync();
    });
  };











  // Start interactive correction review
  const handleStartReview = async () => {
    if (!documentData) {
      setError("No document data available.");
      setSuccess(false);
      return;
    }
    try {
      setError("");
      setMessage("Processing corrections...");
      
      await Word.run(async context => {
        const processedCorrections = await processCorrectionData(context, documentData);
        setCorrections(processedCorrections);
        
        if (processedCorrections.length === 0) {
          setMessage("No corrections found to review.");
          setSuccess(true);
          return;
        }

        // Initialize the review manager with preview highlighting
        setMessage("Highlighting corrections in document...");
        await correctionReviewManager.startReview(processedCorrections);
        setIsReviewActive(true);
        setMessage("Review started! All corrections are now highlighted in the document.");
        
        // Set up event listeners
        correctionReviewManager.onProgress((progress) => {
          setReviewProgress(progress);
        });
        
        correctionReviewManager.setCorrectionChangeCallback((correction) => {
          setCurrentCorrection(correction);
          if (correction) {
            highlightCurrentCorrection(correction);
          }
        });
        
        setMessage(`Review started. Found ${processedCorrections.length} corrections to review.`);
        setSuccess(true);
      });
    } catch (e: any) {
      console.error("Error starting review:", e);
      setError("Error starting review: " + e.message);
      setSuccess(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '24px' }}>
      <h2>Diff pipeline</h2>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <button onClick={handleButtonClick}>Load JSON</button>
      {!isReviewActive ? (
        <button
          style={primaryButtonStyle}
          onClick={handleStartReview}
          disabled={!documentData}
        >
          ▶️ Start Review
        </button>
      ) : (
        <button
          style={dangerButtonStyle}
          onClick={handleEndReview}
        >
          ⏹️ End Review
        </button>
      )}
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      {message && <div style={{ color: "blue", marginTop: 8 }}>{message}</div>}
      {success && (
        <div style={{ color: "green", marginTop: 8 }}>
          Operation completed successfully!
        </div>
      )}


      {isReviewActive && corrections.length > 0 && (
        <div className="ms-welcome__features">
          <h3>Correction Suggestions</h3>
          
          {/* Progress Summary */}
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f3f2f1', borderRadius: '4px' }}>
            <div><strong>Total Corrections:</strong> {corrections.length}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Applied: {corrections.filter(c => c.status === 'applied').length} | 
              Rejected: {corrections.filter(c => c.status === 'rejected').length} | 
              Pending: {corrections.filter(c => c.status === 'pending').length}
            </div>
          </div>

          {/* All Corrections List */}
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
            {corrections.map((correction, index) => {
              const isAnimating = animatingCorrections.has(correction.id);
              const isProcessed = correction.status === 'applied' || correction.status === 'rejected';
              
              return (
                <div 
                  key={correction.id} 
                  style={{ 
                    padding: '12px', 
                    borderBottom: index < corrections.length - 1 ? '1px solid #eee' : 'none',
                    backgroundColor: correction.status === 'applied' ? '#f0f8f0' : 
                                   correction.status === 'rejected' ? '#fdf2f2' : 
                                   correction.status === 'skipped' ? '#f8f8f8' : 'white',
                    transition: 'all 0.3s ease-in-out',
                    opacity: isAnimating ? 0.3 : (isProcessed ? 0.6 : 1),
                    transform: isAnimating ? 'scale(0.95)' : 'scale(1)',
                    maxHeight: isProcessed && !isAnimating ? '0px' : '200px',
                    overflow: 'hidden',
                    marginBottom: isProcessed && !isAnimating ? '0px' : '4px',
                    paddingTop: isProcessed && !isAnimating ? '0px' : '12px',
                    paddingBottom: isProcessed && !isAnimating ? '0px' : '12px',
                    filter: isProcessed ? 'grayscale(50%)' : 'none'
                  }}
                >
                {/* Error Header with Para ID and Offset */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    <strong>Para {correction.paragraphNumber}</strong> • ID: {correction.wordNativeParaId} • {correction.errorType}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999' }}>
                    {correction.status === 'applied' ? '✅ Applied' :
                     correction.status === 'rejected' ? '❌ Rejected' :
                     correction.status === 'skipped' ? '⏭️ Skipped' : '⏳ Pending'}
                  </div>
                </div>

                {/* Error Details with Offset */}
                <div style={{ marginBottom: '8px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #e9ecef' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>
                    {correction.suggestion}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                    <strong>Offset:</strong> {correction.startOffset}-{correction.endOffset} • <strong>Type:</strong> {correction.changeType}
                  </div>
                  <div style={{ fontSize: '12px', color: '#555' }}>
                    {correction.actionDescription}
                  </div>
                </div>

                {/* Action Buttons - Only show for pending corrections */}
                {correction.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      style={{
                        ...successButtonStyle,
                        fontSize: '12px',
                        padding: '4px 8px'
                      }}
                      onClick={() => handleApplySpecificCorrection(correction.id)}
                    >
                      ✅ Accept
                    </button>
                    <button
                      style={{
                        ...dangerButtonStyle,
                        fontSize: '12px',
                        padding: '4px 8px'
                      }}
                      onClick={() => handleRejectSpecificCorrection(correction.id)}
                    >
                      ❌ Reject
                    </button>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {/* Bulk Actions */}
          <div style={{ marginTop: '15px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              style={successButtonStyle}
              onClick={handleApplyAllCorrections}
              disabled={corrections.filter(c => c.status === 'pending').length === 0}
            >
              ✅ Accept All
            </button>
            <button
              style={dangerButtonStyle}
              onClick={handleRejectAllCorrections}
              disabled={corrections.filter(c => c.status === 'pending').length === 0}
            >
              ❌ Reject All
            </button>
          </div>
        </div>
      )}

      {/* Review Complete Message */}
      {isReviewActive && !currentCorrection && (
        <div className="ms-welcome__features">
          <h3>Review Complete!</h3>
          <div style={{ padding: '15px', backgroundColor: '#f3f2f1', borderRadius: '4px' }}>
            <div><strong>Final Statistics:</strong></div>
            <div>Applied: {reviewProgress.applied}</div>
            <div>Rejected: {reviewProgress.rejected}</div>
            <div>Skipped: {reviewProgress.skipped}</div>
            {reviewProgress.skipped > 0 && (
              <div style={{ marginTop: '10px', color: '#d13438' }}>
                Note: {reviewProgress.skipped} corrections were skipped and may need attention.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
