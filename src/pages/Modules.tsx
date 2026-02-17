import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, BookOpen } from 'lucide-react';
import { Module, University } from '../types';
import { getModulesByUniversity, addModule, updateModule, deleteModule } from '../services/moduleService';
import { getUniversities } from '../services/universityService';
import Modal from '../components/Modal';

const Modules = () => {
  const [universities, setUniversities] = useState<University[]>([]);
  const [selectedUniversityId, setSelectedUniversityId] = useState<string>('');
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingModule, setEditingModule] = useState<Module | null>(null);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      fetchModules(selectedUniversityId);
    }
  }, [selectedUniversityId]);

  const fetchModules = async (uniId: string) => {
    setLoading(true);
    try {
      const data = await getModulesByUniversity(uniId);
      setModules(data);
    } catch (error) {
      console.error('Error fetching modules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (module?: Module) => {
    if (module) {
      setEditingModule(module);
      setCode(module.code);
      setName(module.name);
    } else {
      setEditingModule(null);
      setCode('');
      setName('');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUniversityId) return;

    setSubmitting(true);
    try {
      if (editingModule) {
        await updateModule(editingModule.moduleId, { code, name });
      } else {
        await addModule(selectedUniversityId, code, name);
      }
      setIsModalOpen(false);
      fetchModules(selectedUniversityId);
    } catch (error) {
      console.error('Error saving module:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this module?')) {
      try {
        await deleteModule(id);
        fetchModules(selectedUniversityId);
      } catch (error) {
        console.error('Error deleting module:', error);
      }
    }
  };

  const filteredModules = modules.filter(mod => 
    mod.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    mod.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Manage Modules</h1>
        <button
          onClick={() => handleOpenModal()}
          disabled={!selectedUniversityId}
          className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 ${!selectedUniversityId ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Plus className="h-5 w-5" />
          <span>Add Module</span>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Modules</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by code or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">Loading...</td>
                </tr>
              ) : filteredModules.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                    {selectedUniversityId ? 'No modules found for this university' : 'Please select a university'}
                  </td>
                </tr>
              ) : (
                filteredModules.map((mod) => (
                  <tr key={mod.moduleId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-blue-600">{mod.code}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{mod.name}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenModal(mod)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(mod.moduleId)}
                        className="text-red-600 hover:text-red-900"
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
        title={editingModule ? 'Edit Module' : 'Add Module'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Module Code</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="SMTH011"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Module Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Introduction to Calculus"
            />
          </div>
          <div className="mt-5 sm:mt-6">
            <button
              type="submit"
              disabled={submitting}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm ${submitting ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Modules;
