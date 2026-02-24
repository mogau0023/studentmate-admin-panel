import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Image as ImageIcon, Video, Check, FileText, Upload, Save, X, Edit2 } from 'lucide-react';
import { Question } from '../types';
import { getQuestions, addQuestion, deleteQuestion, updateQuestion } from '../services/assessmentService';
import Modal from './Modal';
import { parsePdf, ExtractedQuestion, renderPageToBlob, cropRectFromPdf, getPageHeight, stitchBlobs } from '../utils/pdfParser';

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
  const [isBulkMemoModalOpen, setIsBulkMemoModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Manual Form states
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [marks, setMarks] = useState(0);
  const [order, setOrder] = useState(1);
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');

  // Bulk Upload states
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [extractedAnswers, setExtractedAnswers] = useState<ExtractedQuestion[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parsingStatus, setParsingStatus] = useState('');

  // Crop editor states
  const [isCropEditorOpen, setIsCropEditorOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<'answers' | 'questions'>('answers');
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const [cropPageNumber, setCropPageNumber] = useState<number>(1);
  const [cropPageImageUrl, setCropPageImageUrl] = useState<string>('');
  const [cropImgClientW, setCropImgClientW] = useState<number>(0);
  const [cropImgClientH, setCropImgClientH] = useState<number>(0);
  const [rectX, setRectX] = useState<number>(0);
  const [rectY, setRectY] = useState<number>(0);
  const [rectW, setRectW] = useState<number>(0);
  const [rectH, setRectH] = useState<number>(200);
  const [dragMode, setDragMode] = useState<string>('');
  const [dragging, setDragging] = useState<boolean>(false);
  const [sliceBlobs, setSliceBlobs] = useState<Blob[]>([]);
  const TEXT_SCALE = 1.6;

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

  const handleOpenModal = (question?: Question) => {
    if (question) {
      setEditingQuestionId(question.questionId);
      setTitle(question.title);
      setMarks(question.marks);
      setOrder(question.order);
      setVideoUrl(question.videoUrl || '');
      setContentFile(null); // Keep existing unless changed
      setAnswerFile(null); // Keep existing unless changed
    } else {
      setEditingQuestionId(null);
      setTitle(`Question ${questions.length + 1}`);
      setMarks(0);
      setOrder(questions.length + 1);
      setVideoUrl('');
      setContentFile(null);
      setAnswerFile(null);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate: Content file required only for new questions
    if (!editingQuestionId && !contentFile) return;

    setSubmitting(true);
    try {
      if (editingQuestionId) {
        await updateQuestion(
          assessmentId,
          editingQuestionId,
          {
            title,
            marks,
            order,
            videoUrl: videoUrl || undefined,
          },
          contentFile,
          answerFile
        );
      } else {
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
      }
      setIsModalOpen(false);
      fetchQuestions();
    } catch (error) {
      console.error('Error saving question:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBulkFile(e.target.files[0]);
      setParsing(true);
      setParsingStatus('Initializing...');
      try {
        const parsed = await parsePdf(e.target.files[0], (status) => setParsingStatus(status));
        if (parsed.length === 0) {
          alert('No questions detected in the PDF. Please ensure the file uses standard headings like "Question 1" or "Q1".');
        }
        setExtractedQuestions(parsed);
      } catch (error) {
        console.error('Error parsing PDF:', error);
        alert('Failed to parse PDF. Please ensure it is a valid PDF.');
      } finally {
        setParsing(false);
        setParsingStatus('');
      }
    }
  };

  const handleBulkMemoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBulkFile(e.target.files[0]);
      setParsing(true);
      setParsingStatus('Initializing...');
      try {
        const parsed = await parsePdf(e.target.files[0], (status) => setParsingStatus(status));
        if (parsed.length === 0) {
          alert('No answers detected in the Memo PDF. Please ensure the file uses "Question 1" or "Answer 1" headings.');
        }
        setExtractedAnswers(parsed);
      } catch (error) {
        console.error('Error parsing Memo PDF:', error);
        alert('Failed to parse Memo PDF.');
      } finally {
        setParsing(false);
        setParsingStatus('');
      }
    }
  };

  const openCropEditorAnswers = async (index: number) => {
    if (!bulkFile) return;
    const ans = extractedAnswers[index];
    const page = ans.page || 1;
    const pageBlob = await renderPageToBlob(bulkFile, page, TEXT_SCALE);
    const pageUrl = pageBlob ? URL.createObjectURL(pageBlob) : '';
    setCropTarget('answers');
    setCropIndex(index);
    setCropPageNumber(page);
    setCropPageImageUrl(pageUrl);
    setRectX(0);
    const initY = Math.max(0, (ans.coordinates?.yStart || 0) * TEXT_SCALE);
    const initH = Math.max(50, ((ans.coordinates?.yEnd || initY + 300) * TEXT_SCALE) - initY);
    setRectY(initY);
    setRectH(initH);
    setRectW(0);
    setSliceBlobs([]);
    setIsCropEditorOpen(true);
  };

  const openCropEditorQuestions = async (index: number) => {
    if (!bulkFile) return;
    const q = extractedQuestions[index];
    const page = q.page || 1;
    const pageBlob = await renderPageToBlob(bulkFile, page, TEXT_SCALE);
    const pageUrl = pageBlob ? URL.createObjectURL(pageBlob) : '';
    setCropTarget('questions');
    setCropIndex(index);
    setCropPageNumber(page);
    setCropPageImageUrl(pageUrl);
    setRectX(0);
    const initY = Math.max(0, (q.coordinates?.yStart || 0) * TEXT_SCALE);
    const initH = Math.max(50, ((q.coordinates?.yEnd || initY + 300) * TEXT_SCALE) - initY);
    setRectY(initY);
    setRectH(initH);
    setRectW(0);
    setSliceBlobs([]);
    setIsCropEditorOpen(true);
  };

  const saveCropEdits = async () => {
    if (cropIndex === null || !bulkFile || !cropPageImageUrl) return;

    const scaleX =
      cropImgClientW > 0
        ? await new Promise<number>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth / cropImgClientW);
            img.src = cropPageImageUrl;
          })
        : 1;

    const scaleY =
      cropImgClientH > 0
        ? await new Promise<number>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalHeight / cropImgClientH);
            img.src = cropPageImageUrl;
          })
        : 1;

    const xCanvas = Math.max(0, (rectW === 0 ? 0 : rectX) * scaleX);
    const yCanvas = Math.max(0, rectY * scaleY);
    const wCanvas = Math.max(1, (rectW === 0 ? cropImgClientW : rectW) * scaleX);
    const hCanvas = Math.max(1, rectH * scaleY);

    const currentBlob = await cropRectFromPdf(bulkFile, cropPageNumber, xCanvas, yCanvas, wCanvas, hCanvas, TEXT_SCALE);
    const all = currentBlob ? [...sliceBlobs, currentBlob] : [...sliceBlobs];
    const stitched = await stitchBlobs(all);

    if (!stitched) {
      setIsCropEditorOpen(false);
      return;
    }

    if (cropTarget === 'answers') {
      const updated = [...extractedAnswers];
      updated[cropIndex] = {
        ...updated[cropIndex],
        imageBlob: stitched,
      };
      setExtractedAnswers(updated);
    } else {
      const updated = [...extractedQuestions];
      updated[cropIndex] = {
        ...updated[cropIndex],
        imageBlob: stitched,
      };
      setExtractedQuestions(updated);
    }

    setIsCropEditorOpen(false);
    setCropIndex(null);
    setCropPageImageUrl('');
    setSliceBlobs([]);
  };

  const handleSaveBulkMemo = async () => {
    if (extractedAnswers.length === 0) return;

    setSubmitting(true);
    try {
      // Loop through extracted answers and try to match with existing questions
      for (const ans of extractedAnswers) {
        // Find matching question by number/order
        const matchingQuestion = questions.find(
          (q) =>
            q.title.toLowerCase().includes(`question ${ans.number}`) ||
            q.title.toLowerCase() === `q${ans.number}` ||
            q.order === ans.number
        );

        if (matchingQuestion && ans.imageBlob) {
          const answerFile = new File([ans.imageBlob], `answer_${ans.number}.jpg`, { type: 'image/jpeg' });
          await updateQuestion(
            assessmentId,
            matchingQuestion.questionId,
            {}, // No data update, just file
            null, // no content file
            answerFile // update answer file
          );
        }
      }
      setIsBulkMemoModalOpen(false);
      setExtractedAnswers([]);
      setBulkFile(null);
      fetchQuestions();
      alert('Memo answers uploaded and matched to questions!');
    } catch (error) {
      console.error('Error saving bulk memo:', error);
      alert('Error saving memo. See console for details.');
    } finally {
      setSubmitting(false);
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
          q.text, // content (text description or fallback)
          undefined, // answerFile
          undefined, // answerText
          undefined, // videoUrl
          q.page, // page
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

  const handleRemoveExtractedAnswer = (index: number) => {
    const newAnswers = [...extractedAnswers];
    newAnswers.splice(index, 1);
    setExtractedAnswers(newAnswers);
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

  const handleDeleteAnswer = async (question: Question) => {
    if (window.confirm('Are you sure you want to remove the answer memo for this question?')) {
      try {
        await updateQuestion(assessmentId, question.questionId, {}, null, null, true);
        fetchQuestions();
      } catch (error) {
        console.error('Error deleting answer:', error);
        alert('Failed to delete answer.');
      }
    }
  };

  const handleSaveResources = async (e: React.FormEvent) => {
    e.preventDefault();
    // Reverted resources implementation
  };

  // ✅ Shared crop editor block (used by BOTH Bulk Upload Memo + Bulk Upload PDF)
  const CropEditor = isCropEditorOpen ? (
    <div className="border-2 border-purple-300 rounded-lg p-3 bg-purple-50">
      <div className="mb-2">
        <label className="block text-sm font-medium text-gray-700">Page</label>
        <input
          type="number"
          min={1}
          value={cropPageNumber}
          onChange={async (e) => {
            const p = parseInt(e.target.value) || 1;
            setCropPageNumber(p);
            if (!bulkFile) return;
            const pageBlob = await renderPageToBlob(bulkFile, p, TEXT_SCALE);
            const pageUrl = pageBlob ? URL.createObjectURL(pageBlob) : '';
            setCropPageImageUrl(pageUrl);
            setRectX(0);
            setRectY(0);
            setRectW(0);
            setRectH(200);
          }}
          className="mt-1 block w-24 border border-gray-300 rounded-md py-1 px-2 text-sm"
        />
      </div>

      <div
        className="relative border rounded bg-white overflow-auto max-h-[60vh]"
        onMouseMove={(e) => {
          if (!dragging) return;
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top + (e.currentTarget.scrollTop || 0);

          let nx = rectX;
          let ny = rectY;
          let nw = rectW || cropImgClientW;
          let nh = rectH;

          if (dragMode === 'move') {
            const dx = x - nx;
            const dy = y - ny;
            nx = Math.max(0, Math.min((cropImgClientW || nw) - nw, rectX + dx));
            ny = Math.max(0, Math.min((cropImgClientH || nh) - nh, rectY + dy));
          } else if (dragMode === 'n') {
            const newY = Math.max(0, Math.min(rectY + rectH - 10, y));
            nh = rectH + (rectY - newY);
            ny = newY;
          } else if (dragMode === 's') {
            nh = Math.max(10, Math.min((cropImgClientH || nh) - rectY, y - rectY));
          } else if (dragMode === 'w') {
            const newX = Math.max(0, Math.min(rectX + nw - 10, x));
            nw = nw + (rectX - newX);
            nx = newX;
          } else if (dragMode === 'e') {
            nw = Math.max(10, Math.min((cropImgClientW || nw) - rectX, x - rectX));
          } else if (dragMode === 'nw') {
            const newX = Math.max(0, Math.min(rectX + nw - 10, x));
            const newY = Math.max(0, Math.min(rectY + rectH - 10, y));
            nw = nw + (rectX - newX);
            nx = newX;
            nh = rectH + (rectY - newY);
            ny = newY;
          } else if (dragMode === 'ne') {
            const newY = Math.max(0, Math.min(rectY + rectH - 10, y));
            nh = rectH + (rectY - newY);
            ny = newY;
            nw = Math.max(10, Math.min((cropImgClientW || nw) - rectX, x - rectX));
          } else if (dragMode === 'sw') {
            nw = nw + Math.max(-nw + 10, Math.min(0, x - rectX));
            nh = Math.max(10, Math.min((cropImgClientH || nh) - rectY, y - rectY));
            nx = Math.max(0, Math.min(rectX + nw - 10, rectX - (x - rectX)));
          } else if (dragMode === 'se') {
            nw = Math.max(10, Math.min((cropImgClientW || nw) - rectX, x - rectX));
            nh = Math.max(10, Math.min((cropImgClientH || nh) - rectY, y - rectY));
          }

          setRectX(nx);
          setRectY(ny);
          setRectW(nw);
          setRectH(nh);
        }}
        onMouseUp={() => {
          setDragging(false);
          setDragMode('');
        }}
        onMouseLeave={() => {
          setDragging(false);
          setDragMode('');
        }}
      >
        {cropPageImageUrl && (
          <img
            src={cropPageImageUrl}
            alt="Page"
            className="max-w-full"
            onLoad={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              setCropImgClientW(el.clientWidth);
              setCropImgClientH(el.clientHeight);
              setRectW((prev) => (prev === 0 ? el.clientWidth : prev));
            }}
          />
        )}

        <div
          className="absolute border-2 border-purple-600 bg-purple-200/10"
          style={{
            left: `${rectX}px`,
            top: `${rectY}px`,
            width: `${rectW || cropImgClientW}px`,
            height: `${rectH}px`,
            cursor: dragging ? 'grabbing' : 'move',
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragMode('move');
            setDragging(true);
          }}
        >
          {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((pos) => {
            const size = 10;
            const style: any = { position: 'absolute', width: `${size}px`, height: `${size}px`, background: '#7c3aed' };
            if (pos === 'nw') {
              style.left = '-5px';
              style.top = '-5px';
            }
            if (pos === 'n') {
              style.left = '50%';
              style.top = '-5px';
              style.transform = 'translateX(-50%)';
            }
            if (pos === 'ne') {
              style.right = '-5px';
              style.top = '-5px';
            }
            if (pos === 'e') {
              style.right = '-5px';
              style.top = '50%';
              style.transform = 'translateY(-50%)';
            }
            if (pos === 'se') {
              style.right = '-5px';
              style.bottom = '-5px';
            }
            if (pos === 's') {
              style.left = '50%';
              style.bottom = '-5px';
              style.transform = 'translateX(-50%)';
            }
            if (pos === 'sw') {
              style.left = '-5px';
              style.bottom = '-5px';
            }
            if (pos === 'w') {
              style.left = '-5px';
              style.top = '50%';
              style.transform = 'translateY(-50%)';
            }
            return (
              <div
                key={pos}
                style={style}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragMode(pos);
                  setDragging(true);
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex justify-between items-center mt-3">
        <div className="text-xs text-gray-600">Slices: {sliceBlobs.length}</div>
        <div className="flex space-x-2">
          <button
            onClick={async () => {
              const scaleX =
                cropImgClientW > 0
                  ? await new Promise<number>((resolve) => {
                      const img = new Image();
                      img.onload = () => resolve(img.naturalWidth / cropImgClientW);
                      img.src = cropPageImageUrl;
                    })
                  : 1;

              const scaleY =
                cropImgClientH > 0
                  ? await new Promise<number>((resolve) => {
                      const img = new Image();
                      img.onload = () => resolve(img.naturalHeight / cropImgClientH);
                      img.src = cropPageImageUrl;
                    })
                  : 1;

              const xCanvas = Math.max(0, (rectW === 0 ? 0 : rectX) * scaleX);
              const yCanvas = Math.max(0, rectY * scaleY);
              const wCanvas = Math.max(1, (rectW === 0 ? cropImgClientW : rectW) * scaleX);
              const hCanvas = Math.max(1, rectH * scaleY);

              const blob = await cropRectFromPdf(bulkFile!, cropPageNumber, xCanvas, yCanvas, wCanvas, hCanvas, TEXT_SCALE);
              if (blob) setSliceBlobs((prev) => [...prev, blob]);
            }}
            className="px-3 py-2 rounded bg-indigo-600 text-white text-sm"
          >
            Add Slice
          </button>

          <button onClick={() => setSliceBlobs([])} className="px-3 py-2 rounded bg-gray-200 text-gray-800 text-sm">
            Clear Slices
          </button>

          <button onClick={saveCropEdits} className="px-3 py-2 rounded bg-purple-600 text-white text-sm">
            Save Crop
          </button>

          <button
            onClick={() => {
              setIsCropEditorOpen(false);
              setDragMode('');
              setDragging(false);
            }}
            className="px-3 py-2 rounded bg-gray-100 text-gray-700 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                  Manage Questions: {assessmentTitle}
                </h3>
                <p className="mt-1 text-sm text-gray-500">Add questions via image upload or auto-parse from PDF.</p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setIsBulkMemoModalOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
                >
                  <FileText className="h-5 w-5" />
                  <span>Bulk Upload Memo</span>
                </button>
                <button
                  onClick={() => setIsBulkModalOpen(true)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
                >
                  <FileText className="h-5 w-5" />
                  <span>Bulk Upload PDF</span>
                </button>
                <button
                  onClick={() => handleOpenModal()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
                >
                  <Plus className="h-5 w-5" />
                  <span>Add Manual</span>
                </button>
                <button onClick={onClose} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg">
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
                          <button onClick={() => handleOpenModal(q)} className="text-blue-500 hover:text-blue-700" title="Edit Question">
                            <Edit2 className="h-5 w-5" />
                          </button>
                          <button onClick={() => handleDelete(q)} className="text-red-500 hover:text-red-700" title="Delete Question">
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
                                <a
                                  href={q.answerUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-500 text-xs hover:underline"
                                >
                                  (View)
                                </a>
                                <button
                                  onClick={() => handleDeleteAnswer(q)}
                                  className="text-red-500 hover:text-red-700 ml-2"
                                  title="Delete Answer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
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
                                <a
                                  href={q.videoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm hover:underline truncate block max-w-[200px]"
                                >
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

      {/* Bulk Memo Modal */}
      {isBulkMemoModalOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
              &#8203;
            </span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-medium text-gray-900">Bulk Upload Memo (Answers)</h3>
                  <button onClick={() => setIsBulkMemoModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  <p className="text-sm text-gray-600">
                    Upload a PDF containing the memorandum. The system will try to match "Question 1" in the memo to "Question 1" in your list.
                  </p>

                  {/* File Upload Area */}
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors">
                    <input type="file" accept=".pdf" onChange={handleBulkMemoChange} className="hidden" id="bulk-memo-upload" />
                    <label htmlFor="bulk-memo-upload" className="cursor-pointer block">
                      <Upload className="mx-auto h-12 w-12 text-purple-400" />
                      <p className="mt-2 text-sm text-gray-600">{bulkFile ? bulkFile.name : 'Click to upload Memo PDF'}</p>
                      <p className="text-xs text-gray-500 mt-1">PDFs with selectable text only</p>
                    </label>
                  </div>

                  {parsing && (
                    <div className="text-center py-4 text-purple-600 font-medium">
                      <div className="animate-pulse">{parsingStatus || 'Parsing Memo...'}</div>
                      <p className="text-xs text-gray-500 mt-1">OCR is running, this may take a minute...</p>
                    </div>
                  )}

                  {/* ✅ Crop Editor (shared) */}
                  {CropEditor}

                  {/* Extracted Answers Preview */}
                  {extractedAnswers.length > 0 && (
                    <div className="mt-6">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-medium text-gray-900">Extracted Answers ({extractedAnswers.length})</h4>
                        <button
                          onClick={handleSaveBulkMemo}
                          disabled={submitting}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 text-sm"
                        >
                          <Save className="h-4 w-4" />
                          <span>{submitting ? 'Matching & Saving...' : 'Match & Save Answers'}</span>
                        </button>
                      </div>

                      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                        {extractedAnswers.map((q, index) => (
                          <div key={index} className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center space-x-2">
                                <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-1 rounded">#{q.number}</span>
                                <span className="text-xs text-gray-500">Detected Answer Section</span>
                              </div>
                              <button onClick={() => handleRemoveExtractedAnswer(index)} className="text-red-500 hover:text-red-700">
                                <X className="h-4 w-4" />
                              </button>
                            </div>

                            {/* Image Preview */}
                            {q.imageBlob ? (
                              <div className="border border-purple-200 rounded p-2 bg-white flex justify-center">
                                <img src={URL.createObjectURL(q.imageBlob)} alt={`Answer ${q.number}`} className="max-w-full max-h-64 object-contain" />
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 italic">No image extracted</div>
                            )}

                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={() => openCropEditorAnswers(index)}
                                className="text-white bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-xs"
                              >
                                Edit Crop
                              </button>
                            </div>
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

      {/* Manual Add Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingQuestionId ? 'Edit Question' : 'Add New Question (Manual)'}
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
            <label className="block text-sm font-medium text-gray-700">
              Question Image {editingQuestionId ? '(Optional - Leave empty to keep existing)' : '(Required)'}
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="content-upload"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                  >
                    <span>Upload a file</span>
                    <input
                      id="content-upload"
                      name="content-upload"
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      onChange={(e) => setContentFile(e.target.files ? e.target.files[0] : null)}
                      required={!editingQuestionId}
                    />
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
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm ${
                submitting ? 'opacity-75 cursor-not-allowed' : ''
              }`}
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
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
              &#8203;
            </span>
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
                    <input type="file" accept=".pdf" onChange={handleBulkFileChange} className="hidden" id="bulk-upload" />
                    <label htmlFor="bulk-upload" className="cursor-pointer block">
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      <p className="mt-2 text-sm text-gray-600">{bulkFile ? bulkFile.name : 'Click to upload Exam PDF'}</p>
                      <p className="text-xs text-gray-500 mt-1">PDFs with selectable text only</p>
                    </label>
                  </div>

                  {parsing && (
                    <div className="text-center py-4 text-green-600 font-medium">
                      <div className="animate-pulse">{parsingStatus || 'Parsing PDF...'}</div>
                      <p className="text-xs text-gray-500 mt-1">OCR is running, this may take a minute...</p>
                    </div>
                  )}

                  {/* ✅ Crop Editor (shared) */}
                  {CropEditor}

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
                                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">#{q.number}</span>
                                <input
                                  type="number"
                                  value={q.marks}
                                  onChange={(e) => handleUpdateExtracted(index, 'marks', parseInt(e.target.value))}
                                  className="w-20 text-xs border-gray-300 rounded p-1"
                                  placeholder="Marks"
                                />
                                <span className="text-xs text-gray-500">marks</span>
                              </div>
                              <button onClick={() => handleRemoveExtracted(index)} className="text-red-500 hover:text-red-700">
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

                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={() => openCropEditorQuestions(index)}
                                className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs"
                              >
                                Edit Crop
                              </button>
                            </div>
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