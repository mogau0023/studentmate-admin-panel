import React from 'react';
import { BarChart, Activity } from 'lucide-react';

const Analytics = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Analytics Overview</h1>

      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-4 rounded-full">
            <BarChart className="h-12 w-12 text-blue-600" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Analytics Dashboard</h2>
        <p className="text-gray-500 max-w-md mx-auto">
          Detailed usage statistics and engagement metrics will appear here once students start using the mobile application.
        </p>
      </div>
    </div>
  );
};

export default Analytics;
