import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FileText, ExternalLink, List, FileQuestion } from 'lucide-react';
import { Assessment, AssessmentType, Module, University } from '../types';
import { getAssessments, addAssessment, deleteAssessment } from '../services/assessmentService';
import { getUniversities } from '../services/universityService';
import { getModulesByUniversity } from '../services/moduleService';
import { useAuthStore } from '../store/authStore';
import Modal from './Modal';
import QuestionManager from './QuestionManager';

interface AssessmentManagerProps {
  type: AssessmentType;
  title: string;
}

const AssessmentManager = ({ type, title }: AssessmentManagerProps) => {
  const { user } = useAuthStore();
  const [universities, setUniversities] = useState<University[]>([]);
  const [selectedUniversityId, setSelectedUniversityId] = useState<string>('');
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (selectedModuleId) {
       // When selected, keep the name in the search box but close dropdown
       // We can't easily map ID back to name without finding it, but that's fine
       setShowDropdown(false);
    }
  }, [selectedModuleId]);

  // Update dropdown visibility when searching
  useEffect(() => {
    // Show dropdown if there is a search term OR if the field is focused (handled by onFocus)
    // Here we just ensure it hides if search term is cleared while not selected
    if (!searchTerm && !selectedModuleId) {
        setShowDropdown(false);
    } else if (searchTerm && !selectedModuleId) {
        setShowDropdown(true);
    }
  }, [searchTerm, selectedModuleId]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAssessmentForQuestions, setSelectedAssessmentForQuestions] = useState<Assessment | null>(null);

  // Form states
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  useEffect(() => {
    const loadUniversities = async () => {
      try {
        const data = await getUniversities();
        setUniversities(data);
        if (data.length > 0) {
          setSelectedUniversityId(data[0].universityId);
        }
      } catch (error) {
        console.error('Error fetching universities:', error);
      }
    };
    loadUniversities();
  }, []);

  useEffect(() => {
    if (selectedUniversityId) {
      const loadModules = async () => {
        try {
          const data = await getModulesByUniversity(selectedUniversityId);
          setModules(data);
          setSelectedModuleId(''); // Reset selection on uni change
          setSearchTerm('');
          setAssessments([]);
        } catch (error) {
          console.error('Error fetching modules:', error);
        }
      };
      loadModules();
    }
  }, [selectedUniversityId]);

  useEffect(() => {
    if (selectedUniversityId && selectedModuleId) {
      fetchAssessments();
    }
  }, [selectedUniversityId, selectedModuleId, type]);

  const fetchAssessments = async () => {
    setLoading(true);
    try {
      const data = await getAssessments(selectedUniversityId, selectedModuleId, type);
      setAssessments(data);
    } catch (error) {
      console.error('Error fetching assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setAssessmentTitle('');
    setYear(new Date().getFullYear());
    setPdfFile(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUniversityId || !selectedModuleId || !user) return;

    setSubmitting(true);
    try {
      await addAssessment(
        selectedUniversityId,
        selectedModuleId,
        type,
        assessmentTitle,
        year,
        user.email || 'Admin',
        pdfFile
      );
      setIsModalOpen(false);
      fetchAssessments();
    } catch (error) {
      console.error('Error saving assessment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (assessment: Assessment) => {
    if (window.confirm('Are you sure you want to delete this assessment?')) {
      try {
        await deleteAssessment(assessment);
        fetchAssessments();
      } catch (error) {
        console.error('Error deleting assessment:', error);
      }
    }
  };

  const filteredModules = searchTerm 
    ? modules.filter(mod => 
        mod.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
        mod.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  const handleModuleSelect = (code: string) => {
    setSelectedModuleId(code);
    setSearchTerm(''); // Clear search term to allow clear button to show
    setShowDropdown(false);
  };

  const handleClearSelection = () => {
    setSelectedModuleId('');
    setSearchTerm('');
    setAssessments([]);
    setShowDropdown(false);
  };

  return (
    <div>
      {selectedAssessmentForQuestions ? (
        <QuestionManager
          assessmentId={selectedAssessmentForQuestions.assessmentId}
          assessmentTitle={selectedAssessmentForQuestions.title}
          onClose={() => setSelectedAssessmentForQuestions(null)}
        />
      ) : null}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <button
          onClick={handleOpenModal}
          disabled={!selectedUniversityId || !selectedModuleId}
          className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 ${(!selectedUniversityId || !selectedModuleId) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Plus className="h-5 w-5" />
          <span>Create {title.slice(0, -1)}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-100 flex items-center space-x-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select University</label>
            <select
              value={selectedUniversityId}
              onChange={(e) => setSelectedUniversityId(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
            >
              {universities.map((uni) => (
                <option key={uni.universityId} value={uni.universityId}>
                  {uni.name} ({uni.code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Module</label>
              {selectedModuleId ? (
                 <div className="p-2 bg-blue-50 text-blue-800 rounded text-sm flex justify-between items-center border border-blue-200">
                   <span>Selected: <strong>{selectedModuleId}</strong></span>
                   <button onClick={handleClearSelection} className="text-blue-500 hover:text-blue-700 font-medium">Change</button>
                 </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type to search (e.g. SMTH011)..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setShowDropdown(true); // Force show on type
                    }}
                    onFocus={() => { 
                        // Show if we have text, or even if empty if you want to show all
                        if (filteredModules.length > 0) setShowDropdown(true); 
                    }}
                    // Optional: onBlur logic to hide dropdown (needs delay to allow click)
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  
                  {showDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                      {filteredModules.length === 0 ? (
                        <div className="cursor-default select-none relative py-2 px-4 text-gray-700">No matching modules found</div>
                      ) : (
                        filteredModules.map((mod) => (
                          <div
                            key={mod.moduleId}
                            className="cursor-pointer select-none relative py-2 px-4 hover:bg-blue-50 text-gray-900"
                            onClick={() => handleModuleSelect(mod.code)}
                          >
                            <span className="font-medium">{mod.code}</span> - {mod.name}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Year</th>
                <th className="px-6 py-3">Title</th>
                <th className="px-6 py-3">Content</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">Loading...</td>
                </tr>
              ) : assessments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                    {!selectedModuleId ? 'Please select a module' : 'No assessments found'}
                  </td>
                </tr>
              ) : (
                assessments.map((assessment) => (
                  <tr key={assessment.assessmentId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{assessment.year}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium text-gray-900">{assessment.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex space-x-4">
                        {assessment.pdfUrl && (
                          <a
                            href={assessment.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-red-600 hover:text-red-900 text-xs"
                            title="Download PDF"
                          >
                            <FileText className="h-4 w-4 mr-1" /> PDF
                          </a>
                        )}
                        <button
                          onClick={() => setSelectedAssessmentForQuestions(assessment)}
                          className="flex items-center text-blue-600 hover:text-blue-900 text-xs"
                          title="Manage Questions"
                        >
                          <List className="h-4 w-4 mr-1" /> Questions
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleDelete(assessment)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Assessment"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Create ${title.slice(0, -1)}`}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Year</label>
            <input
              type="number"
              required
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              required
              value={assessmentTitle}
              onChange={(e) => setAssessmentTitle(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="e.g. Final Exam, Semester Test 1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Paper PDF (Optional)</label>
            <p className="text-xs text-gray-500 mb-1">Upload the full paper if you have it, otherwise you can add questions individually later.</p>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setPdfFile(e.target.files ? e.target.files[0] : null)}
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <div className="mt-5 sm:mt-6">
            <button
              type="submit"
              disabled={submitting}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm ${submitting ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {submitting ? 'Creating...' : 'Create Assessment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AssessmentManager;
