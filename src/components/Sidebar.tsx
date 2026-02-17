import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  School, 
  BookOpen, 
  FileText, 
  FileSpreadsheet, 
  FileCheck, 
  Users, 
  BarChart, 
  Megaphone,
  LogOut
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

const Sidebar = () => {
  const navigate = useNavigate();
  const { setUser, setAdminProfile } = useAuthStore();

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setUser(null);
      setAdminProfile(null);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/universities', label: 'Manage Universities', icon: School },
    { path: '/modules', label: 'Modules', icon: BookOpen },
    { path: '/exams', label: 'Exams', icon: FileText },
    { path: '/tests', label: 'Tests', icon: FileSpreadsheet },
    { path: '/supplementary-exams', label: 'Supp. Exams', icon: FileCheck },
    { path: '/users', label: 'Manage Users', icon: Users },
    { path: '/analytics', label: 'Analytics', icon: BarChart },
    { path: '/announcements', label: 'Announcements', icon: Megaphone },
  ];

  return (
    <div className="h-screen w-64 bg-gradient-to-b from-blue-600 to-blue-800 text-white flex flex-col fixed left-0 top-0 z-10">
      <div className="p-6 flex items-center space-x-3">
        <div className="bg-white/10 p-2 rounded-lg">
          <School className="h-8 w-8 text-white" />
        </div>
        <span className="text-xl font-bold">StudentMATE</span>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-blue-500">
        <div className="bg-blue-900/50 rounded-lg p-4 mb-4 flex items-center space-x-3">
          <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium">Admin</p>
            <p className="text-xs text-blue-200">Super Admin</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-500/80 hover:bg-red-600 rounded-lg transition-colors text-sm"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
