'use client';

import React from 'react';

const AuditDetailModal = ({ show, title, details, onClose }) => {
  if (!show || !details) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full shadow-xl">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">{title}</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Risks in workflow: <span className="font-bold">{details.workflowName}</span>
        </p>
        <div className="max-h-60 overflow-y-auto mb-6">
          {details.nodes && details.nodes.length > 0 ? (
            <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300">
              {details.nodes.map((node, idx) => (
                <li key={idx} className="mb-2">
                  <span className="font-medium">{node.nodeName}:</span> {node.riskCount} risk(s)
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">No specific node risks found for this workflow.</p>
          )}
        </div>
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

export default AuditDetailModal;
