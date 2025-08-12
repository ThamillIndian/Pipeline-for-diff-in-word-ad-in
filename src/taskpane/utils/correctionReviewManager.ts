/**
 * CorrectionReviewManager - Handles interactive correction review workflow
 * Provides navigation, application, and tracking of corrections
 */

import { CorrectionObject } from './documentMapping';

export interface ReviewProgress {
  current: number;
  total: number;
  applied: number;
  rejected: number;
  skipped: number;
  pending: number;
}

export interface ReviewSession {
  corrections: CorrectionObject[];
  currentIndex: number;
  isActive: boolean;
  startTime: Date;
}

export class CorrectionReviewManager {
  private session: ReviewSession | null = null;
  private onProgressUpdate?: (progress: ReviewProgress) => void;
  private onCorrectionChange?: (correction: CorrectionObject | null) => void;

  /**
   * Initialize a new review session with corrections and preview highlighting
   */
  async startReview(corrections: CorrectionObject[]): Promise<void> {
    this.session = {
      corrections: corrections.map(c => ({ ...c })), // Deep copy
      currentIndex: 0,
      isActive: true,
      startTime: new Date()
    };

    console.log(`🚀 Started review session with ${corrections.length} corrections`);
    
    // Highlight all corrections in Word document for preview
    await this.highlightAllCorrections();
    
    this.notifyProgressUpdate();
    this.notifyCurrentCorrectionChange();
  }

  /**
   * Get the current correction being reviewed
   */
  getCurrentCorrection(): CorrectionObject | null {
    if (!this.session || this.session.currentIndex >= this.session.corrections.length) {
      return null;
    }
    return this.session.corrections[this.session.currentIndex];
  }

  /**
   * Apply the current correction to the document
   */
  async applyCurrentCorrection(): Promise<boolean> {
    const current = this.getCurrentCorrection();
    if (!current || !current.wordRange) {
      return false;
    }

    try {
      await Word.run(async context => {
        // Apply the correction by replacing text in the Word range
        if (current.changeType === 'addition') {
          // Insert the new text
          current.wordRange!.insertText(current.diffText, Word.InsertLocation.end);
        } else if (current.changeType === 'deletion') {
          // Remove the text (find and delete specific text)
          const searchResults = current.wordRange!.search(current.diffText);
          searchResults.load('items');
          await context.sync();
          
          if (searchResults.items.length > 0) {
            searchResults.items[0].delete();
          }
        } else if (current.changeType === 'modification') {
          // Replace the entire range with corrected text
          current.wordRange!.insertText(current.correctedText, Word.InsertLocation.replace);
        }

        await context.sync();
      });

      // Update correction status
      current.status = 'applied';
      console.log(`Applied correction: ${current.changeType} "${current.diffText}"`);
      
      this.moveToNext();
      return true;
    } catch (error) {
      console.error('Error applying correction:', error);
      return false;
    }
  }

  /**
   * Reject the current correction
   */
  rejectCurrentCorrection(): void {
    const current = this.getCurrentCorrection();
    if (current) {
      current.status = 'rejected';
      console.log(`Rejected correction: ${current.changeType} "${current.diffText}"`);
      this.moveToNext();
    }
  }

  /**
   * Skip the current correction for later review
   */
  skipCurrentCorrection(): void {
    const current = this.getCurrentCorrection();
    if (current) {
      current.status = 'skipped';
      console.log(`Skipped correction: ${current.changeType} "${current.diffText}"`);
      this.moveToNext();
    }
  }

  /**
   * Navigate to the next correction
   */
  navigateNext(): void {
    if (this.session && this.session.currentIndex < this.session.corrections.length - 1) {
      this.session.currentIndex++;
      this.notifyProgressUpdate();
      this.notifyCurrentCorrectionChange();
    }
  }

  /**
   * Navigate to the previous correction
   */
  navigatePrevious(): void {
    if (this.session && this.session.currentIndex > 0) {
      this.session.currentIndex--;
      this.notifyProgressUpdate();
      this.notifyCurrentCorrectionChange();
    }
  }

  /**
   * Jump to a specific correction by index
   */
  navigateToIndex(index: number): void {
    if (this.session && index >= 0 && index < this.session.corrections.length) {
      this.session.currentIndex = index;
      this.notifyProgressUpdate();
      this.notifyCurrentCorrectionChange();
    }
  }

  /**
   * Get current review progress and statistics
   */
  getProgress(): ReviewProgress {
    if (!this.session) {
      return { current: 0, total: 0, applied: 0, rejected: 0, skipped: 0, pending: 0 };
    }

    const stats = this.session.corrections.reduce((acc, correction) => {
      acc[correction.status]++;
      return acc;
    }, { applied: 0, rejected: 0, skipped: 0, pending: 0 } as any);

    return {
      current: this.session.currentIndex + 1,
      total: this.session.corrections.length,
      ...stats
    };
  }

  /**
   * Check if review session is complete
   */
  isReviewComplete(): boolean {
    if (!this.session) return false;
    
    const progress = this.getProgress();
    return progress.pending === 0;
  }

  /**
   * Get all skipped corrections for final review
   */
  getSkippedCorrections(): CorrectionObject[] {
    if (!this.session) return [];
    return this.session.corrections.filter(c => c.status === 'skipped');
  }

  /**
   * End the current review session
   */
  endReview(): ReviewProgress {
    const finalProgress = this.getProgress();
    console.log('Review session ended:', finalProgress);
    this.session = null;
    return finalProgress;
  }

  /**
   * Set callback for progress updates
   */
  onProgress(callback: (progress: ReviewProgress) => void): void {
    this.onProgressUpdate = callback;
  }

  /**
   * Set callback for current correction changes
   */
  setCorrectionChangeCallback(callback: (correction: CorrectionObject | null) => void): void {
    this.onCorrectionChange = callback;
  }

  /**
   * Highlight all corrections in the Word document for preview
   */
  private async highlightAllCorrections(): Promise<void> {
    if (!this.session) {
      console.log(`❌ No session available for highlighting`);
      return;
    }

    console.log(`🎨 Highlighting ${this.session.corrections.length} corrections in Word document...`);

    try {
      await Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load("items");
        await context.sync();

        for (const correction of this.session.corrections) {
          try {
            await this.highlightSingleCorrection(context, paragraphs, correction);
          } catch (error) {
            console.warn(`⚠️ Failed to highlight correction ${correction.id}:`, error);
          }
        }

        console.log(`✅ Successfully highlighted all corrections`);
      });
    } catch (error) {
      console.error('❌ Error highlighting corrections:', error);
    }
  }

  /**
   * Highlight a single correction using precise character offset positioning
   */
  private async highlightSingleCorrection(
    context: Word.RequestContext,
    paragraphs: Word.ParagraphCollection,
    correction: CorrectionObject
  ): Promise<void> {
    const paragraphIndex = correction.paragraphNumber - 1;
    
    if (paragraphIndex >= 0 && paragraphIndex < paragraphs.items.length) {
      const wordParagraph = paragraphs.items[paragraphIndex];
      wordParagraph.load('text');
      await context.sync();

      const paragraphText = wordParagraph.text;
      console.log(`🎯 Highlighting correction ${correction.id} at EXACT offset ${correction.startOffset}-${correction.endOffset}:`);
      console.log(`   Type: ${correction.changeType}, Text: "${correction.diffText}"`);
      console.log(`   Paragraph text length: ${paragraphText.length}`);
      console.log(`   Text at offset: "${paragraphText.substring(correction.startOffset, correction.endOffset)}"`);

      try {
        let targetRange: Word.Range | null = null;
        let highlightColor = '';
        
        // Use precise character offset positioning with Word API workaround
        if (correction.changeType === 'deletion') {
          // For deletions, get the exact text at the specified offset and search for it
          if (correction.startOffset < paragraphText.length && correction.endOffset <= paragraphText.length && correction.startOffset < correction.endOffset) {
            const exactTextToDelete = paragraphText.substring(correction.startOffset, correction.endOffset);
            console.log(`📍 Deleting exact text at offset ${correction.startOffset}-${correction.endOffset}: "${exactTextToDelete}"`);
            
            // Create a precise search that finds the text at the correct position
            // We'll search for a unique context that includes the text to delete
            const contextBefore = paragraphText.substring(Math.max(0, correction.startOffset - 5), correction.startOffset);
            const contextAfter = paragraphText.substring(correction.endOffset, Math.min(paragraphText.length, correction.endOffset + 5));
            const searchPattern = contextBefore + exactTextToDelete + contextAfter;
            
            console.log(`   Context search pattern: "${searchPattern}"`);
            
            if (searchPattern.trim()) {
              const searchResults = wordParagraph.search(searchPattern, { matchCase: false });
              searchResults.load('items');
              await context.sync();
              
              if (searchResults.items.length > 0) {
                // Found the context, now create a range for just the text to delete
                const contextRange = searchResults.items[0];
                contextRange.load(['text']);
                await context.sync();
                
                // Search within the context range for the exact text to delete
                const deleteResults = contextRange.search(exactTextToDelete, { matchCase: false });
                deleteResults.load('items');
                await context.sync();
                
                if (deleteResults.items.length > 0) {
                  targetRange = deleteResults.items[0];
                  console.log(`   ✅ Found exact deletion target: "${targetRange.text}"`);
                } else {
                  // Fallback to the context range
                  targetRange = contextRange;
                }
              }
            }
            
            // Ultimate fallback: search for just the text to delete
            if (!targetRange && exactTextToDelete.trim()) {
              const searchResults = wordParagraph.search(exactTextToDelete, { matchCase: false });
              searchResults.load('items');
              await context.sync();
              if (searchResults.items.length > 0) {
                targetRange = searchResults.items[0];
              }
            }
            
            highlightColor = 'Pink';
          }
        } else if (correction.changeType === 'addition') {
          // For additions, highlight context around the insertion point
          const insertionPoint = Math.min(correction.startOffset, paragraphText.length);
          console.log(`📍 Creating addition highlight around insertion point ${insertionPoint}`);
          
          // Get context around insertion point for highlighting
          const contextStart = Math.max(0, insertionPoint - 3);
          const contextEnd = Math.min(paragraphText.length, insertionPoint + 3);
          
          if (contextEnd > contextStart) {
            const contextText = paragraphText.substring(contextStart, contextEnd);
            console.log(`   Addition context: "${contextText}"`);
            
            if (contextText.trim()) {
              const searchResults = wordParagraph.search(contextText, { matchCase: false });
              searchResults.load('items');
              await context.sync();
              if (searchResults.items.length > 0) {
                targetRange = searchResults.items[0];
              }
            }
          }
          
          // Fallback: highlight a word around the insertion point
          if (!targetRange) {
            const wordStart = paragraphText.lastIndexOf(' ', insertionPoint - 1) + 1;
            const wordEnd = paragraphText.indexOf(' ', insertionPoint);
            const wordToHighlight = paragraphText.substring(
              wordStart,
              wordEnd === -1 ? paragraphText.length : wordEnd
            );
            
            if (wordToHighlight.trim()) {
              const searchResults = wordParagraph.search(wordToHighlight, { matchCase: false });
              searchResults.load('items');
              await context.sync();
              if (searchResults.items.length > 0) {
                targetRange = searchResults.items[0];
              }
            }
          }
          
          highlightColor = 'LightGreen';
        } else if (correction.changeType === 'modification') {
          // For modifications, get the exact text to be changed
          if (correction.startOffset < paragraphText.length && correction.endOffset <= paragraphText.length && correction.startOffset < correction.endOffset) {
            const exactTextToModify = paragraphText.substring(correction.startOffset, correction.endOffset);
            console.log(`📍 Modifying exact text at offset ${correction.startOffset}-${correction.endOffset}: "${exactTextToModify}"`);
            
            // Search for the exact text to modify
            if (exactTextToModify.trim()) {
              const searchResults = wordParagraph.search(exactTextToModify, { matchCase: false });
              searchResults.load('items');
              await context.sync();
              if (searchResults.items.length > 0) {
                targetRange = searchResults.items[0];
              }
            }
          }
          
          highlightColor = 'LightBlue';
        }

        // Apply highlighting if we successfully created a range
        if (targetRange && highlightColor) {
          targetRange.load(['font', 'text']);
          await context.sync();

          console.log(`   📍 Successfully created range: "${targetRange.text}" (length: ${targetRange.text.length})`);

          // Apply preview highlighting with multiple visual cues
          targetRange.font.highlightColor = highlightColor;
          targetRange.font.underline = 'Single';
          
          // Add color coding for different change types
          if (correction.changeType === 'deletion') {
            targetRange.font.color = 'Red';
          } else if (correction.changeType === 'addition') {
            targetRange.font.color = 'Green';
          } else {
            targetRange.font.color = 'Blue';
          }
          
          // Create content control for tracking
          const contentControl = targetRange.insertContentControl();
          contentControl.tag = `correction_${correction.id}`;
          contentControl.title = `${correction.changeType}: ${correction.diffText} (offset: ${correction.startOffset}-${correction.endOffset})`;
          
          await context.sync();
          
          console.log(`✅ Successfully highlighted ${correction.changeType} at offset ${correction.startOffset}-${correction.endOffset}`);
        } else {
          console.warn(`⚠️ Could not create precise range for correction ${correction.id} - using fallback`);
          await this.applyFallbackHighlighting(wordParagraph, correction);
        }
      } catch (error) {
        console.error(`❌ Error with precise highlighting for correction ${correction.id}:`, error);
        await this.applyFallbackHighlighting(wordParagraph, correction);
      }
    }
  }

  /**
   * Apply fallback highlighting when precise offset positioning fails
   */
  private async applyFallbackHighlighting(wordParagraph: Word.Paragraph, correction: CorrectionObject): Promise<void> {
    try {
      console.log(`🔄 Applying fallback highlighting for correction ${correction.id}`);
      
      // Try text search as fallback
      if (correction.diffText && correction.diffText.trim()) {
        const searchResults = wordParagraph.search(correction.diffText, { matchCase: false });
        searchResults.load('items');
        await Word.run(async (context) => {
          await context.sync();
          
          if (searchResults.items.length > 0) {
            const targetRange = searchResults.items[0];
            targetRange.load(['font']);
            await context.sync();
            
            // Apply fallback highlighting
            targetRange.font.highlightColor = 'Yellow';
            targetRange.font.underline = 'Single';
            
            const contentControl = targetRange.insertContentControl();
            contentControl.tag = `correction_${correction.id}`;
            contentControl.title = `${correction.changeType}: ${correction.diffText} (fallback)`;
            
            await context.sync();
            console.log(`✅ Applied fallback highlighting for: "${correction.diffText}"`);
          } else {
            // Ultimate fallback: highlight entire paragraph
            const paragraphRange = wordParagraph.getRange();
            paragraphRange.load(['font']);
            await context.sync();
            
            paragraphRange.font.highlightColor = 'LightYellow';
            const contentControl = paragraphRange.insertContentControl();
            contentControl.tag = `correction_${correction.id}`;
            contentControl.title = `${correction.changeType}: ${correction.diffText} (paragraph fallback)`;
            
            await context.sync();
            console.log(`🔄 Applied paragraph fallback highlighting`);
          }
        });
      }
    } catch (fallbackError) {
      console.error(`❌ Even fallback highlighting failed:`, fallbackError);
    }
  }

  /**
   * Remove highlight for a specific correction after it's accepted
   */
  private async removeHighlight(correctionId: string): Promise<void> {
    try {
      await Word.run(async (context) => {
        // Find content controls with the correction tag
        const contentControls = context.document.contentControls;
        contentControls.load('items');
        await context.sync();

        for (const control of contentControls.items) {
          control.load(['tag', 'range']);
        }
        await context.sync();

        // Find and remove the highlight for this correction
        for (const control of contentControls.items) {
          if (control.tag === `correction_${correctionId}`) {
            // Get the range from the content control
            const range = control.getRange();
            range.load(['font']);
            await context.sync();

            // Remove highlighting
            range.font.highlightColor = null;
            range.font.underline = 'None';
            
            // Remove the content control
            control.delete(false); // Keep the text, remove the control
            
            await context.sync();
            console.log(`🧹 Removed highlight for correction: ${correctionId}`);
            break;
          }
        }
      });
    } catch (error) {
      console.error('❌ Error removing highlight:', error);
    }
  }

  /**
   * Apply a specific correction by ID
   */
  async applySpecificCorrection(correctionId: string): Promise<boolean> {
    if (!this.session) {
      console.log(`❌ No session available for correction application`);
      return false;
    }
    
    const correction = this.session.corrections.find(c => c.id === correctionId);
    if (!correction) {
      console.log(`❌ Correction not found: ${correctionId}`);
      return false;
    }
    
    if (correction.status !== 'pending') {
      console.log(`❌ Correction ${correctionId} is not pending (status: ${correction.status})`);
      return false;
    }
    
    console.log(`🚀 Starting correction application for: ${correctionId}`);
    console.log(`📋 Correction details:`, {
      id: correction.id,
      paragraphNumber: correction.paragraphNumber,
      changeType: correction.changeType,
      diffText: correction.diffText,
      originalText: correction.originalText,
      correctedText: correction.correctedText,
      startOffset: correction.startOffset,
      endOffset: correction.endOffset
    });
    
    try {
      // Apply the correction to Word document
      await Word.run(async (context) => {
        console.log(`📖 Loading Word document paragraphs...`);
        
        // Get the paragraph by number (1-based to 0-based conversion)
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load("items");
        await context.sync();
        
        console.log(`📊 Total paragraphs in document: ${paragraphs.items.length}`);
        
        const paragraphIndex = correction.paragraphNumber - 1;
        console.log(`🎯 Looking for paragraph at index ${paragraphIndex} (paragraph number ${correction.paragraphNumber})`);
        
        if (paragraphIndex >= 0 && paragraphIndex < paragraphs.items.length) {
          const wordParagraph = paragraphs.items[paragraphIndex];
          wordParagraph.load('text');
          await context.sync();
          
          const currentText = wordParagraph.text;
          console.log(`📄 Found paragraph ${correction.paragraphNumber}:`);
          console.log(`   Current text: "${currentText}"`);
          console.log(`   Expected original: "${correction.originalText}"`);
          console.log(`   Target corrected: "${correction.correctedText}"`);
          
          // Check if the paragraph text matches what we expect
          const normalizedCurrent = currentText.trim().replace(/\s+/g, ' ');
          const normalizedOriginal = correction.originalText.trim().replace(/\s+/g, ' ');
          
          if (normalizedCurrent !== normalizedOriginal) {
            console.log(`⚠️ WARNING: Paragraph text mismatch!`);
            console.log(`   Normalized current: "${normalizedCurrent}"`);
            console.log(`   Normalized expected: "${normalizedOriginal}"`);
            
            // Fallback to paragraph-level replacement for reliability
            try {
              console.log(`🔧 Falling back to paragraph-level replacement`);
              const targetCorrectedText = correction.correctedText.trim();
              const originalText = wordParagraph.text; // Save current text for potential rollback
              
              // Apply the correction by replacing the entire paragraph
              wordParagraph.clear();
              await context.sync();
              wordParagraph.insertText(targetCorrectedText, Word.InsertLocation.start);
              await context.sync();
              
              // Verify the paragraph content matches the expected corrected text
              wordParagraph.load('text');
              await context.sync();
              
              const updatedText = wordParagraph.text.trim().replace(/\s+/g, ' ');
              const expectedText = targetCorrectedText.trim().replace(/\s+/g, ' ');
              
              if (updatedText !== expectedText) {
                console.error(`❌ Fallback validation failed: Updated text does not match expected`);
                console.log(`   Expected: "${expectedText}"`);
                console.log(`   Actual:   "${updatedText}"`);
                
                // Revert changes by restoring original text
                wordParagraph.clear();
                await context.sync();
                wordParagraph.insertText(originalText, Word.InsertLocation.start);
                await context.sync();
                
                // Show error message to user
                await Word.run(async () => {
                  const dialogUrl = `about:blank?error=${encodeURIComponent(`Failed to apply correction to paragraph ${correction.paragraphNumber}. The content could not be updated correctly.`)}`;
                  Office.context.ui.displayDialogAsync(dialogUrl, {
                    height: 30,
                    width: 50,
                    promptBeforeOpen: false
                  });
                });
                
                throw new Error(`Failed to apply fallback correction to paragraph ${correction.paragraphNumber}.`);
              }
              
              console.log(`✅ Fallback paragraph replacement and validation successful`);
            } catch (fallbackError) {
              console.error(`❌ Fallback paragraph replacement failed:`, fallbackError);
              throw fallbackError; // Re-throw to be caught by outer try-catch
            }
          } else {
            // Apply correction at segment level for precise change tracking
            try {
              console.log(`🎯 Applying ${correction.changeType} correction: "${correction.diffText}" at offset ${correction.startOffset}-${correction.endOffset}`);
              
              // Save the original paragraph text for potential rollback
              const originalText = wordParagraph.text;
              
              // Apply correction based on change type
              if (correction.changeType === 'deletion') {
                await this.applyDeletionCorrection(context, wordParagraph, correction);
              } else if (correction.changeType === 'addition') {
                await this.applyAdditionCorrection(context, wordParagraph, correction);
              } else if (correction.changeType === 'modification') {
                await this.applyModificationCorrection(context, wordParagraph, correction);
              }
              
              // Verify the paragraph content matches the expected corrected text
              await context.sync();
              wordParagraph.load('text');
              await context.sync();
              
              const updatedText = wordParagraph.text.trim().replace(/\s+/g, ' ');
              const expectedText = correction.correctedText.trim().replace(/\s+/g, ' ');
              
              if (updatedText !== expectedText) {
                console.error(`❌ Validation failed: Updated text does not match expected`);
                console.log(`   Expected: "${expectedText}"`);
                console.log(`   Actual:   "${updatedText}"`);
                
                // Revert changes by restoring original text
                wordParagraph.clear();
                await context.sync();
                wordParagraph.insertText(normalizedCurrent, Word.InsertLocation.start);
                await context.sync();
                
                // Show error message to user
                await Word.run(async () => {
                  // Using Office.context.ui.displayDialogAsync for better error display
                  const dialogUrl = `about:blank?error=${encodeURIComponent(`Failed to apply correction to paragraph ${correction.paragraphNumber}. The content could not be updated correctly.`)}`;
                  Office.context.ui.displayDialogAsync(dialogUrl, {
                    height: 30,
                    width: 50,
                    promptBeforeOpen: false
                  });
                });
                
                throw new Error(`Failed to apply correction to paragraph ${correction.paragraphNumber}. The content could not be updated correctly.`);
              }
              
              console.log(`✅ Successfully applied and validated ${correction.changeType} correction at paragraph ${correction.paragraphNumber}`);
            } catch (fallbackError) {
              console.log(`❌ Fallback also failed:`, fallbackError);
              throw fallbackError;
            }
          }
        } else {
          console.log(`❌ Paragraph index ${paragraphIndex} is out of range (0-${paragraphs.items.length - 1})`);
          throw new Error(`Paragraph ${correction.paragraphNumber} not found in document`);
        }
      });
      
      correction.status = 'applied';
      // Remove the preview highlight after applying the correction
      await this.removeHighlight(correctionId);
      this.notifyProgressUpdate();
      console.log(`Successfully applied correction: ${correction.actionDescription}`);
      return true;
    } catch (error) {
      console.error('Error applying specific correction:', error);
      return false;
    }
  }

  /**
   * Apply a deletion correction with precise highlighting
   */
  private async applyDeletionCorrection(
    context: Word.RequestContext,
    wordParagraph: Word.Paragraph,
    correction: CorrectionObject
  ): Promise<void> {
    console.log(`🗑️ Applying deletion: "${correction.diffText}"`);
    
    // For deletion, find and highlight the specific text before deleting
    const searchResults = wordParagraph.search(correction.diffText, { 
      matchCase: false,
      matchWholeWord: false 
    });
    searchResults.load('items');
    await context.sync();
    
    if (searchResults.items.length > 0) {
      const targetRange = searchResults.items[0];
      
      // Load range properties for highlighting
      targetRange.load(['text', 'font']);
      await context.sync();
      
      console.log(`🎯 Found text to delete: "${targetRange.text}"`);
      
      // Apply strikethrough and red highlighting to show deletion
      targetRange.font.strikeThrough = true;
      targetRange.font.color = 'Red';
      targetRange.font.highlightColor = 'Pink';
      await context.sync();
      
      console.log(`✅ Applied deletion highlighting to: "${correction.diffText}"`);
      
      // Note: We keep the text with strikethrough instead of deleting it
      // This provides better visual feedback for the correction
    } else {
      console.warn(`⚠️ Could not find exact text to delete: "${correction.diffText}"`);
      // Fallback: highlight the general area where deletion should occur
      wordParagraph.font.highlightColor = 'Pink';
      await context.sync();
    }
  }

  /**
   * Apply an addition correction with precise highlighting
   */
  private async applyAdditionCorrection(
    context: Word.RequestContext,
    wordParagraph: Word.Paragraph,
    correction: CorrectionObject
  ): Promise<void> {
    console.log(`➕ Applying addition: "${correction.diffText}"`);
    
    // For addition, insert text at the correct position with highlighting
    const paragraphText = wordParagraph.text;
    
    let insertedRange: Word.Range;
    
    // Try to find a good insertion point by looking for surrounding text
    if (correction.startOffset > 0 && correction.startOffset < paragraphText.length) {
      // Get some context before the insertion point
      const contextBefore = paragraphText.substring(Math.max(0, correction.startOffset - 10), correction.startOffset);
      
      if (contextBefore.trim()) {
        const searchResults = wordParagraph.search(contextBefore, { matchCase: false });
        searchResults.load('items');
        await context.sync();
        
        if (searchResults.items.length > 0) {
          // Insert the text after the context
          insertedRange = searchResults.items[0].insertText(correction.diffText, Word.InsertLocation.after);
          console.log(`🎯 Inserted text after context: "${contextBefore}"`);
        } else {
          // Fallback to end insertion
          insertedRange = wordParagraph.insertText(correction.diffText, Word.InsertLocation.end);
          console.log(`🔄 Fallback: Inserted text at end of paragraph`);
        }
      } else {
        insertedRange = wordParagraph.insertText(correction.diffText, Word.InsertLocation.end);
      }
    } else {
      // Insert at the end of paragraph
      insertedRange = wordParagraph.insertText(correction.diffText, Word.InsertLocation.end);
    }
    
    // Apply highlighting to the newly inserted text
    insertedRange.load(['text', 'font']);
    await context.sync();
    
    insertedRange.font.color = 'Green';
    insertedRange.font.highlightColor = 'LightGreen';
    insertedRange.font.bold = true;
    await context.sync();
    
    console.log(`✅ Applied addition highlighting to: "${correction.diffText}"`);
  }

  /**
   * Apply a modification correction with precise highlighting
   */
  private async applyModificationCorrection(
    context: Word.RequestContext,
    wordParagraph: Word.Paragraph,
    correction: CorrectionObject
  ): Promise<void> {
    console.log(`🔄 Applying modification: "${correction.diffText}"`);
    
    // For paragraph-level modifications (startOffset=0, endOffset=full length), 
    // replace the entire paragraph content with highlighting
    if (correction.startOffset === 0 && correction.endOffset === correction.originalText.length) {
      console.log(`🔄 Replacing entire paragraph with: "${correction.diffText}"`);
      
      // Clear and replace entire paragraph content
      wordParagraph.clear();
      await context.sync();
      
      const insertedRange = wordParagraph.insertText(correction.diffText, Word.InsertLocation.start);
      
      // Load range properties and apply highlighting
      insertedRange.load(['text', 'font']);
      await context.sync();
      
      insertedRange.font.color = 'DarkBlue';
      insertedRange.font.highlightColor = 'Yellow';
      insertedRange.font.bold = true;
      await context.sync();
      
      console.log(`✅ Successfully replaced and highlighted entire paragraph content`);
    } else {
      // For segment-level modifications, replace specific text with precise highlighting
      const paragraphText = wordParagraph.text;
      const originalSegment = paragraphText.substring(correction.startOffset, correction.endOffset);
      
      console.log(`🔄 Replacing segment "${originalSegment}" with "${correction.diffText}"`);
      
      // Search for the original text and replace it
      const searchResults = wordParagraph.search(originalSegment, { 
        matchCase: false,
        matchWholeWord: false 
      });
      searchResults.load('items');
      await context.sync();
      
      if (searchResults.items.length > 0) {
        // Replace the first occurrence with highlighting
        const replacedRange = searchResults.items[0].insertText(correction.diffText, Word.InsertLocation.replace);
        
        // Load range properties and apply highlighting
        replacedRange.load(['text', 'font']);
        await context.sync();
        
        replacedRange.font.color = 'DarkBlue';
        replacedRange.font.highlightColor = 'Turquoise';
        replacedRange.font.bold = true;
        await context.sync();
        
        console.log(`✅ Replaced and highlighted segment "${originalSegment}" with "${correction.diffText}"`);
      } else {
        console.warn(`⚠️ Could not find exact text to replace: "${originalSegment}"`);
        // Fallback: highlight the entire paragraph to show modification occurred
        wordParagraph.font.highlightColor = 'Turquoise';
        await context.sync();
      }
    }
  }

  /**
   * Reject a specific correction by ID
   */
  async rejectSpecificCorrection(correctionId: string): Promise<boolean> {
    if (!this.session) return false;
    
    const correction = this.session.corrections.find(c => c.id === correctionId);
    if (!correction || correction.status !== 'pending') return false;
    
    correction.status = 'rejected';
    this.notifyProgressUpdate();
    return true;
  }

  /**
   * Apply all pending corrections
   */
  async applyAllPendingCorrections(): Promise<void> {
    if (!this.session) return;
    
    const pendingCorrections = this.session.corrections.filter(c => c.status === 'pending');
    
    for (const correction of pendingCorrections) {
      await this.applySpecificCorrection(correction.id);
    }
  }

  /**
   * Reject all pending corrections
   */
  async rejectAllPendingCorrections(): Promise<void> {
    if (!this.session) return;
    
    const pendingCorrections = this.session.corrections.filter(c => c.status === 'pending');
    
    for (const correction of pendingCorrections) {
      await this.rejectSpecificCorrection(correction.id);
    }
  }

  /**
   * Navigate to previous correction
   */
  async previousCorrection(): Promise<void> {
    this.navigatePrevious();
  }

  /**
   * Navigate to next correction
   */
  async nextCorrection(): Promise<void> {
    this.navigateNext();
  }

  /**
   * Private helper to move to next correction and update UI
   */
  private moveToNext(): void {
    this.navigateNext();
    
    // If we've reached the end, check for skipped corrections
    if (this.session && this.session.currentIndex >= this.session.corrections.length) {
      const skipped = this.getSkippedCorrections();
      if (skipped.length > 0) {
        console.log(`Review complete. ${skipped.length} corrections were skipped.`);
      } else {
        console.log('Review complete. All corrections processed.');
      }
    }
  }

  /**
   * Notify listeners of progress updates
   */
  private notifyProgressUpdate(): void {
    if (this.onProgressUpdate) {
      this.onProgressUpdate(this.getProgress());
    }
  }

  /**
   * Notify listeners of current correction changes
   */
  private notifyCurrentCorrectionChange(): void {
    if (this.onCorrectionChange) {
      this.onCorrectionChange(this.getCurrentCorrection());
    }
  }
}

// Export singleton instance
export const correctionReviewManager = new CorrectionReviewManager();
