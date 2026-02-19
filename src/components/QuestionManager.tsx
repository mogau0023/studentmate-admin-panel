import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Image as ImageIcon, Video, Check, FileText, Upload, Save, X, Link as LinkIcon } from 'lucide-react';
import { Question } from '../types';
import { getQuestions, addQuestion, deleteQuestion, updateAssessmentResources } from '../services/assessmentService';
import Modal from './Modal';
import { parsePdf, ExtractedQuestion } from '../utils/pdfParser';

interface QuestionManagerProps {
  assessmentId: string;
  assessmentTitle: string;
  onClose: () => void;
}

const QuestionManager = ({ assessmentId, assessmentTitle, onClose }: QuestionManagerProps) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isResourcesModalOpen, setIsResourcesModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Manual Form states
  const [title, setTitle] = useState('');
  const [marks, setMarks] = useState(0);
  const [order, setOrder] = useState(1);
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');

  // Bulk Upload states
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [parsing, setParsing] = useState(false);

  // Resources states
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const [resourceVideoUrl, setResourceVideoUrl] = useState('');

  useEffect(() => {
    fetchQuestions();
  }, [assessmentId]);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const data = await getQuestions(assessmentId);
      setQuestions(data);
      if (data.length > 0) {
        setOrder(data.length + 1);
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setTitle(`Question ${questions.length + 1}`);
    setMarks(0);
    setContentFile(null);
    setAnswerFile(null);
    setVideoUrl('');
    setOrder(questions.length + 1);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contentFile) return;

    setSubmitting(true);
    try {
      await addQuestion(
        assessmentId,
        title,
        marks,
        order,
        contentFile,
        undefined, // content
        answerFile,
        undefined, // answerText
        videoUrl
      );
      setIsModalOpen(false);
      fetchQuestions();
    } catch (error) {
      console.error('Error adding question:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBulkFile(e.target.files[0]);
      setParsing(true);
      try {
        const parsed = await parsePdf(e.target.files[0]);
        setExtractedQuestions(parsed);
      } catch (error) {
        console.error('Error parsing PDF:', error);
        alert('Failed to parse PDF. Please ensure it is a valid PDF.');
      } finally {
        setParsing(false);
      }
    }
  };

  const handleSaveBulk = async () => {
    if (extractedQuestions.length === 0) return;

    setSubmitting(true);
    try {
      // Process sequentially to maintain order if needed
      let currentOrder = questions.length > 0 ? questions.length + 1 : 1;

      for (const q of extractedQuestions) {
        // Convert Blob to File if present
        let contentFile: File | undefined = undefined;
        if (q.imageBlob) {
          contentFile = new File([q.imageBlob], `question_${q.number}.jpg`, { type: 'image/jpeg' });
        }

        await addQuestion(
          assessmentId,
          `Question ${q.number}`,
          q.marks,
          currentOrder++,
          contentFile,
          q.text,    // content (text description or fallback)
          undefined, // answerFile
          undefined, // answerText
          undefined, // videoUrl
          q.page,    // page
          q.coordinates // coordinates
        );
      }
      setIsBulkModalOpen(false);
      setExtractedQuestions([]);
      setBulkFile(null);
      fetchQuestions();
    } catch (error) {
      console.error('Error saving bulk questions:', error);
      alert('Error saving questions. See console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveExtracted = (index: number) => {
    const newQuestions = [...extractedQuestions];
    newQuestions.splice(index, 1);
    setExtractedQuestions(newQuestions);
  };

  const handleUpdateExtracted = (index: number, field: keyof ExtractedQuestion, value: any) => {
    const newQuestions = [...extractedQuestions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    setExtractedQuestions(newQuestions);
  };

  const handleDelete = async (question: Question) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      try {
        await deleteQuestion(assessmentId, question);
        fetchQuestions();
      } catch (error) {
        console.error('Error deleting question:', error);
      }
    }
  };

  const handleSaveResources = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memoFile && !resourceVideoUrl) return;

    setSubmitting(true);
    try {
      await updateAssessmentResources(assessmentId, memoFile, resourceVideoUrl || undefined);
      alert('Resources updated successfully!');
      setIsResourcesModalOpen(false);
      setMemoFile(null);
      setResourceVideoUrl('');
    } catch (error) {
      console.error('Error updating resources:', error);
      alert('Failed to update resources.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                  Manage Questions: {assessmentTitle}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Add questions via image upload or auto-parse from PDF.
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setIsResourcesModalOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
                >
                  <LinkIcon className="h-5 w-5" />
                  <span>Resources</span>
                </button>
                <button
                  onClick={() => setIsBulkModalOpen(true)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
                >
                  <FileText className="h-5 w-5" />
                  <span>Bulk Upload PDF</span>
                </button>
                <button
                  onClick={handleOpenModal}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
                >
                  <Plus className="h-5 w-5" />
                  <span>Add Manual</span>
                </button>
                <button
                  onClick={onClose}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg min-h-[400px] p-4 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="text-center py-10">Loading questions...</div>
              ) : questions.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  No questions added yet. Click "Add Manual" or "Bulk Upload PDF" to start.
                </div>
              ) : (
                <div className="space-y-6">
                  {questions.map((q) => (
                    <div key={q.questionId} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                      {/* Card Header */}
                      <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                        <div className="flex items-center space-x-3">
                          <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
                          <h4 className="font-bold text-blue-900">{q.title}</h4>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-bold">
                            {q.marks} Marks
                          </span>
                          <button
                            onClick={() => handleDelete(q)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="p-4">
                        <div className="mb-4">
                          <p className="text-xs text-gray-500 mb-1 uppercase font-semibold">Question Content</p>
                          <div className="border border-gray-100 rounded bg-gray-50 p-2">
                            {q.contentUrl ? (
                              <img src={q.contentUrl} alt={q.title} className="max-w-full h-auto max-h-64 object-contain" />
                            ) : q.content ? (
                              <div className="whitespace-pre-wrap text-gray-800 font-serif">{q.content}</div>
                            ) : (
                              <span className="text-gray-400 italic">No content available</span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-gray-500 mb-1 uppercase font-semibold">Answer</p>
                            {q.answerUrl ? (
                              <div className="flex items-center space-x-2 text-green-600">
                                <Check className="h-4 w-4" />
                                <span className="text-sm">Answer Image Uploaded</span>
                                <a href={q.answerUrl} target="_blank" rel="noreferrer" className="text-blue-500 text-xs hover:underline">(View)</a>
                              </div>
                            ) : q.answerText ? (
                                <div className="text-sm text-gray-700">{q.answerText}</div>
                            ) : (
                              <span className="text-sm text-gray-400">No answer provided</span>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1 uppercase font-semibold">Video Solution</p>
                            {q.videoUrl ? (
                              <div className="flex items-center space-x-2 text-blue-600">
                                <Video className="h-4 w-4" />
                                <a href={q.videoUrl} target="_blank" rel="noreferrer" className="text-sm hover:underline truncate block max-w-[200px]">
                                  {q.videoUrl}
                                </a>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">No video link</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resources Modal */}
      <Modal
        isOpen={isResourcesModalOpen}
        onClose={() => setIsResourcesModalOpen(false)}
        title="Assessment Resources"
      >
        <form onSubmit={handleSaveResources} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Memorandum PDF (Optional)</label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="memo-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>Upload a file</span>
                    <input id="memo-upload" name="memo-upload" type="file" className="sr-only" accept=".pdf" onChange={(e) => setMemoFile(e.target.files ? e.target.files[0] : null)} />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PDF up to 10MB</p>
                {memoFile && <p className="text-sm text-green-600 font-semibold">{memoFile.name}</p>}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Full Video Solution URL (Optional)</label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                https://
              </span>
              <input
                type="url"
                value={resourceVideoUrl}
                onChange={(e) => setResourceVideoUrl(e.target.value)}
                className="focus:ring-blue-500 focus:border-blue-500 flex-1 block w-full rounded-none rounded-r-md sm:text-sm border-gray-300 py-2 px-3 border"
                placeholder="youtube.com/playlist?list=..."
              />
            </div>
          </div>

          <div className="mt-5 sm:mt-6">
            <button
              type="submit"
              disabled={submitting}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-purple-600 text-base font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 sm:text-sm ${submitting ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {submitting ? 'Saving Resources...' : 'Save Resources'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manual Add Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Question (Manual)"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Question Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Question 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Marks</label>
              <input
                type="number"
                required
                min="0"
                value={marks}
                onChange={(e) => setMarks(parseInt(e.target.value))}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Order</label>
            <input
              type="number"
              required
              min="1"
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value))}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Question Image (Required)</label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="content-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>Upload a file</span>
                    <input id="content-upload" name="content-upload" type="file" className="sr-only" accept="image/*" onChange={(e) => setContentFile(e.target.files ? e.target.files[0] : null)} required />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
                {contentFile && <p className="text-sm text-green-600 font-semibold">{contentFile.name}</p>}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Answer Image (Optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setAnswerFile(e.target.files ? e.target.files[0] : null)}
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Video Solution URL (Optional)</label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                https://
              </span>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="focus:ring-blue-500 focus:border-blue-500 flex-1 block w-full rounded-none rounded-r-md sm:text-sm border-gray-300 py-2 px-3 border"
                placeholder="youtube.com/watch?v=..."
              />
            </div>
          </div>

          <div className="mt-5 sm:mt-6">
            <button
              type="submit"
              disabled={submitting}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm ${submitting ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {submitting ? 'Saving Question...' : 'Save Question'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Upload Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-medium text-gray-900">Bulk Upload from PDF</h3>
                  <button onClick={() => setIsBulkModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* File Upload Area */}
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleBulkFileChange}
                      className="hidden"
                      id="bulk-upload"
                    />
                    <label htmlFor="bulk-upload" className="cursor-pointer block">
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      <p className="mt-2 text-sm text-gray-600">
                        {bulkFile ? bulkFile.name : "Click to upload Exam PDF"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">PDFs with selectable text only</p>
                    </label>
                  </div>

                  {parsing && (
                    <div className="text-center py-4 text-blue-600 font-medium">
                      Parsing PDF... Please wait.
                    </div>
                  )}

                  {/* Extracted Questions Preview */}
                  {extractedQuestions.length > 0 && (
                    <div className="mt-6">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-medium text-gray-900">Extracted Questions ({extractedQuestions.length})</h4>
                        <button
                          onClick={handleSaveBulk}
                          disabled={submitting}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 text-sm"
                        >
                          <Save className="h-4 w-4" />
                          <span>{submitting ? 'Saving...' : 'Save All to Database'}</span>
                        </button>
                      </div>

                      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                        {extractedQuestions.map((q, index) => (
                          <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center space-x-2">
                                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                                  #{q.number}
                                </span>
                                <input
                                  type="number"
                                  value={q.marks}
                                  onChange={(e) => handleUpdateExtracted(index, 'marks', parseInt(e.target.value))}
                                  className="w-20 text-xs border-gray-300 rounded p-1"
                                  placeholder="Marks"
                                />
                                <span className="text-xs text-gray-500">marks</span>
                              </div>
                              <button
                                onClick={() => handleRemoveExtracted(index)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            
                            {/* Image Preview instead of Text Area */}
                            {q.imageBlob ? (
                              <div className="border border-gray-300 rounded p-2 bg-white flex justify-center">
                                <img 
                                  src={URL.createObjectURL(q.imageBlob)} 
                                  alt={`Question ${q.number}`} 
                                  className="max-w-full max-h-64 object-contain"
                                />
                              </div>
                            ) : (
                               <textarea
                                value={q.text}
                                onChange={(e) => handleUpdateExtracted(index, 'text', e.target.value)}
                                className="w-full text-sm border-gray-300 rounded p-2 h-24 font-serif"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionManager;
