/**
 * BulkPaperUpload.tsx
 * Place this file at: src/components/BulkPaperUpload.tsx
 *
 * A dedicated modal/page for uploading many PDF papers at once.
 * Each PDF goes through: upload to Firebase → OCR parse → save questions automatically.
 *
 * HOW TO USE:
 * Add a "Bulk Upload Papers" button in AssessmentManager.tsx that opens this component.
 * See the comment at the bottom of this file for the exact change to AssessmentManager.
 */

import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import { parsePdf } from '../utils/pdfParser';
import { addAssessment, addQuestion } from '../services/assessmentService';
import { AssessmentType } from '../types';

interface PaperJob {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'parsing' | 'saving' | 'done' | 'error';
  progress: string;
  questionsFound: number;
  error?: string;
  assessmentId?: string;
}

interface BulkPaperUploadProps {
  universityId: string;
  moduleId: string;
  type: AssessmentType;
  createdBy: string;
  onClose: () => void;
  onComplete: () => void; // Called when all done — refreshes the parent list
}

const BulkPaperUpload = ({
  universityId,
  moduleId,
  type,
  createdBy,
  onClose,
  onComplete,
}: BulkPaperUploadProps) => {
  const [jobs, setJobs] = useState<PaperJob[]>([]);
  const [running, setRunning] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive year from filename if possible: looks for 4-digit year like "2023" in filename
  function guessYear(filename: string): number {
    const match = filename.match(/\b(20\d{2}|19\d{2})\b/);
    return match ? parseInt(match[1]) : new Date().getFullYear();
  }

  // Derive a clean title from filename: strips extension, replaces underscores/hyphens
  function guessTitle(filename: string): string {
    return filename
      .replace(/\.[^/.]+$/, '')      // remove extension
      .replace(/[_\-]+/g, ' ')       // underscores/hyphens → spaces
      .replace(/\b(20\d{2}|19\d{2})\b/g, '') // remove year (we store it separately)
      .replace(/\s+/g, ' ')
      .trim() || 'Exam Paper';
  }

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const newJobs: PaperJob[] = Array.from(files)
      .filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
      .map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'queued',
        progress: 'Queued',
        questionsFound: 0,
      }));

    if (newJobs.length === 0) {
      alert('Please select PDF files only.');
      return;
    }

    setJobs((prev) => [...prev, ...newJobs]);
  };

  const updateJob = (id: string, patch: Partial<PaperJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const toggleExpanded = (id: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /**
   * Processes a single paper job:
   * 1. Creates the assessment doc in Firestore (with PDF URL)
   * 2. Parses the PDF with pdfParser
   * 3. Saves each extracted question to Firestore
   */
  const processJob = async (job: PaperJob) => {
    const year = guessYear(job.file.name);
    const title = guessTitle(job.file.name);

    try {
      // Step 1: Create assessment + upload PDF
      updateJob(job.id, { status: 'uploading', progress: 'Creating assessment...' });
      const assessmentId = await addAssessment(
        universityId,
        moduleId,
        type,
        title,
        year,
        createdBy,
        job.file
      );
      updateJob(job.id, { assessmentId, progress: 'PDF uploaded. Parsing...' });

      // Step 2: Parse questions from PDF
      updateJob(job.id, { status: 'parsing' });
      const extracted = await parsePdf(job.file, (status) => {
        updateJob(job.id, { progress: status });
      });

      if (extracted.length === 0) {
        // Still mark as done — admin can add questions manually later
        updateJob(job.id, {
          status: 'done',
          progress: 'No questions detected — paper saved. Add questions manually.',
          questionsFound: 0,
        });
        return;
      }

      // Step 3: Save each extracted question
      updateJob(job.id, { status: 'saving', progress: `Saving ${extracted.length} questions...` });
      let order = 1;
      for (const q of extracted) {
        let contentFile: File | undefined;
        if (q.imageBlob) {
          contentFile = new File([q.imageBlob], `q${q.number}.jpg`, { type: 'image/jpeg' });
        }
        await addQuestion(
          assessmentId,
          `Question ${q.number}`,
          q.marks,
          order++,
          contentFile,
          q.text,
          undefined,
          undefined,
          undefined,
          q.page,
          q.coordinates
        );
      }

      updateJob(job.id, {
        status: 'done',
        progress: `Done — ${extracted.length} questions saved`,
        questionsFound: extracted.length,
      });
    } catch (err: any) {
      updateJob(job.id, {
        status: 'error',
        progress: 'Failed',
        error: err?.message || 'Unknown error',
      });
    }
  };

  /**
   * Runs all queued jobs sequentially.
   * Sequential (not parallel) because pdfParser is CPU-heavy in the browser.
   * For 2000 papers, run this overnight — it will process until all are done.
   */
  const handleStartProcessing = async () => {
    const queued = jobs.filter((j) => j.status === 'queued');
    if (queued.length === 0) return;

    setRunning(true);
    for (const job of queued) {
      await processJob(job);
    }
    setRunning(false);
    onComplete();
  };

  const queuedCount = jobs.filter((j) => j.status === 'queued').length;
  const doneCount = jobs.filter((j) => j.status === 'done').length;
  const errorCount = jobs.filter((j) => j.status === 'error').length;
  const processingJob = jobs.find((j) => ['uploading', 'parsing', 'saving'].includes(j.status));

  const statusIcon = (status: PaperJob['status']) => {
    if (status === 'done') return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />;
    if (status === 'error') return <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
    if (['uploading', 'parsing', 'saving'].includes(status))
      return <Loader className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />;
    return <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />;
  };

  const statusColor = (status: PaperJob['status']) => {
    if (status === 'done') return 'bg-green-50 border-green-200';
    if (status === 'error') return 'bg-red-50 border-red-200';
    if (['uploading', 'parsing', 'saving'].includes(status)) return 'bg-blue-50 border-blue-200';
    return 'bg-gray-50 border-gray-200';
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={!running ? onClose : undefined} />

        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl z-10">
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Bulk Paper Upload</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Upload multiple exam papers at once. Each PDF is parsed automatically.
              </p>
            </div>
            {!running && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            )}
          </div>

          <div className="p-6 space-y-5">
            {/* Drop zone */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesSelected(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf"
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">
                Drop PDFs here, or click to select files
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Select as many as you want. Filenames like <code>Math_2022_Exam.pdf</code> will auto-detect the year.
              </p>
            </div>

            {/* Stats bar */}
            {jobs.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex gap-4">
                  <span className="text-gray-500">{jobs.length} total</span>
                  {queuedCount > 0 && <span className="text-gray-400">{queuedCount} queued</span>}
                  {doneCount > 0 && <span className="text-green-600">{doneCount} done</span>}
                  {errorCount > 0 && <span className="text-red-600">{errorCount} failed</span>}
                </div>
                {processingJob && (
                  <span className="text-blue-600 font-medium text-xs animate-pulse">
                    Processing: {processingJob.file.name}
                  </span>
                )}
              </div>
            )}

            {/* Job list */}
            {jobs.length > 0 && (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`border rounded-lg px-4 py-3 ${statusColor(job.status)}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {statusIcon(job.status)}
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {job.file.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-500">{job.progress}</span>

                        {job.status === 'error' && (
                          <button
                            onClick={() => toggleExpanded(job.id)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {expandedJobs.has(job.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        )}

                        {job.status === 'queued' && !running && (
                          <button
                            onClick={() => removeJob(job.id)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Error detail */}
                    {job.status === 'error' && expandedJobs.has(job.id) && (
                      <div className="mt-2 text-xs text-red-700 bg-red-100 rounded p-2">
                        {job.error}
                      </div>
                    )}

                    {/* Done summary */}
                    {job.status === 'done' && job.questionsFound > 0 && (
                      <div className="mt-1 text-xs text-green-700">
                        {job.questionsFound} questions extracted
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Important note */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <strong>Note:</strong> Processing runs in your browser one paper at a time.
              Keep this tab open and your screen on. For 100+ papers, consider processing in batches overnight.
              Papers where OCR fails are still saved — you can add questions manually via the Questions button.
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            {!running && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleStartProcessing}
              disabled={running || queuedCount === 0}
              className={`px-6 py-2 text-sm font-medium text-white rounded-lg flex items-center gap-2
                ${running || queuedCount === 0
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
                }`}
            >
              {running ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Processing {queuedCount} remaining...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Start Processing {queuedCount} Paper{queuedCount !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkPaperUpload;

/**
 * ─────────────────────────────────────────────────────────────────
 * HOW TO ADD THIS TO AssessmentManager.tsx:
 * ─────────────────────────────────────────────────────────────────
 *
 * 1. At the top of AssessmentManager.tsx, add this import:
 *
 *    import BulkPaperUpload from './BulkPaperUpload';
 *
 * 2. Inside the AssessmentManager component, add this state:
 *
 *    const [showBulkUpload, setShowBulkUpload] = useState(false);
 *
 * 3. In the JSX, find the "Create {title.slice(0, -1)}" button and add
 *    a new button NEXT TO it:
 *
 *    <button
 *      onClick={() => setShowBulkUpload(true)}
 *      disabled={!selectedUniversityId || !selectedModuleId}
 *      className={`bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 ${(!selectedUniversityId || !selectedModuleId) ? 'opacity-50 cursor-not-allowed' : ''}`}
 *    >
 *      <Upload className="h-5 w-5" />
 *      <span>Bulk Upload Papers</span>
 *    </button>
 *
 *    (Also import Upload from 'lucide-react' if not already there)
 *
 * 4. At the END of the return JSX in AssessmentManager, before the closing </div>, add:
 *
 *    {showBulkUpload && (
 *      <BulkPaperUpload
 *        universityId={selectedUniversityId}
 *        moduleId={selectedModuleId}
 *        type={type}
 *        createdBy={user?.email || 'Admin'}
 *        onClose={() => setShowBulkUpload(false)}
 *        onComplete={() => {
 *          setShowBulkUpload(false);
 *          fetchAssessments();
 *        }}
 *      />
 *    )}
 */