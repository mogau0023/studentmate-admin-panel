import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  FileText, 
  DollarSign, 
  FileCheck,
  ArrowRight
} from 'lucide-react';
import { Assessment, University } from '../types';
import { getRecentAssessments, getDashboardStats } from '../services/assessmentService';
import { getUniversities } from '../services/universityService';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <div className="bg-white rounded-xl shadow-sm p-6 flex items-center space-x-4">
    <div className={`p-4 rounded-lg ${color}`}>
      <Icon className="h-6 w-6 text-white" />
    </div>
    <div>
      <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
      <p className="text-sm text-gray-500">{title}</p>
    </div>
  </div>
);

const Dashboard = () => {
  const [recentAssessments, setRecentAssessments] = useState<Assessment[]>([]);
  const [stats, setStats] = useState({ exams: 0, tests: 0, supps: 0 });
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [recent, statsData, unis] = await Promise.all([
          getRecentAssessments(),
          getDashboardStats(),
          getUniversities()
        ]);
        setRecentAssessments(recent);
        setStats(statsData);
        setUniversities(unis);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex space-x-2 bg-white rounded-lg p-1 shadow-sm overflow-x-auto max-w-md">
          {universities.slice(0, 5).map((uni) => (
            <button 
              key={uni.universityId}
              className="px-4 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 whitespace-nowrap"
            >
              {uni.code}
            </button>
          ))}
          <Link to="/universities" className="px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md whitespace-nowrap flex items-center">
            View All <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Total Exams" 
          value={stats.exams} 
          icon={Calendar} 
          color="bg-blue-500" 
        />
        <StatCard 
          title="Total Tests" 
          value={stats.tests} 
          icon={FileText} 
          color="bg-orange-500" 
        />
        <StatCard 
          title="Supp. Exams" 
          value={stats.supps} 
          icon={DollarSign} 
          color="bg-green-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Exams */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-bold text-gray-900">Recent Uploads</h2>
            <Link to="/exams" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center">
              + Manage Assessments
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Title</th>
                  <th className="px-6 py-3">Year</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">Loading...</td>
                  </tr>
                ) : recentAssessments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500 py-10">
                      <p className="text-lg font-medium text-gray-900">No recent uploads</p>
                      <p className="text-sm text-gray-500">Start by adding universities, modules, and assessments.</p>
                    </td>
                  </tr>
                ) : (
                  recentAssessments.map((item) => (
                    <tr key={item.assessmentId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 capitalize">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          item.type === 'exam' ? 'bg-blue-100 text-blue-800' :
                          item.type === 'test' ? 'bg-orange-100 text-orange-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-gray-900">{item.title}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.year}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 flex items-center space-x-2">
                        <span>{item.createdBy.split('@')[0]}</span>
                        <span className="text-xs text-gray-400">
                          {item.createdAt?.seconds ? formatDistanceToNow(new Date(item.createdAt.seconds * 1000), { addSuffix: true }) : 'now'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
