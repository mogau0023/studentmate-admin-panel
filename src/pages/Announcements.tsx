import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Megaphone, CheckCircle, XCircle } from 'lucide-react';
import { Announcement, University } from '../types';
import { getAnnouncements, addAnnouncement, updateAnnouncementStatus, deleteAnnouncement } from '../services/announcementService';
import { getUniversities } from '../services/universityService';
import Modal from '../components/Modal';

const Announcements = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetUniversityId, setTargetUniversityId] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [annData, uniData] = await Promise.all([
        getAnnouncements(),
        getUniversities()
      ]);
      setAnnouncements(annData);
      setUniversities(uniData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setTitle('');
    setMessage('');
    setTargetUniversityId('');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addAnnouncement(title, message, targetUniversityId || 'all', isActive);
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error creating announcement:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (announcement: Announcement) => {
    try {
      await updateAnnouncementStatus(announcement.announcementId, !announcement.active);
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this announcement?')) {
      try {
        await deleteAnnouncement(id);
        fetchData();
      } catch (error) {
        console.error('Error deleting announcement:', error);
      }
    }
  };

  const getTargetName = (uniId: string) => {
    if (uniId === 'all') return 'All Universities';
    const uni = universities.find(u => u.universityId === uniId);
    return uni ? uni.name : 'Unknown';
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        <button
          onClick={handleOpenModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Create Announcement</span>
        </button>
      </div>

      <div className="grid gap-6">
        {loading ? (
          <div className="text-center text-gray-500 py-10">Loading...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center text-gray-500 py-10 bg-white rounded-xl shadow-sm">
            No announcements found
          </div>
        ) : (
          announcements.map((ann) => (
            <div key={ann.announcementId} className="bg-white rounded-xl shadow-sm p-6 flex justify-between items-start">
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-lg ${ann.active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  <Megaphone className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{ann.title}</h3>
                  <p className="text-gray-600 mt-1">{ann.message}</p>
                  <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                    <span className="bg-gray-100 px-2 py-1 rounded-md">
                      Target: {getTargetName(ann.universityId)}
                    </span>
                    <span>
                      Created: {ann.createdAt ? new Date(ann.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleToggleStatus(ann)}
                  className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    ann.active 
                      ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {ann.active ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>Active</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      <span>Inactive</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(ann.announcementId)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Announcement"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="e.g. System Maintenance"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Message</label>
            <textarea
              required
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Enter announcement details..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Target Audience</label>
            <select
              value={targetUniversityId}
              onChange={(e) => setTargetUniversityId(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="">Select Target...</option>
              <option value="all">All Universities</option>
              {universities.map((uni) => (
                <option key={uni.universityId} value={uni.universityId}>
                  {uni.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center">
            <input
              id="active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="active" className="ml-2 block text-sm text-gray-900">
              Set as Active immediately
            </label>
          </div>
          <div className="mt-5 sm:mt-6">
            <button
              type="submit"
              disabled={submitting}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm ${submitting ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {submitting ? 'Creating...' : 'Create Announcement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Announcements;
