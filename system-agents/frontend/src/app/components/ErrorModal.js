'use client';

import React from 'react';

const ErrorModal = ({ show, title, message, onClose }) => {
  if (!show) return null;
  return (
    // Increased z-index to z-[9999] to ensure it appears on top of everything
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">{title}</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
        <button
          onClick={onClose}
          className="w-full bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default ErrorModal;
