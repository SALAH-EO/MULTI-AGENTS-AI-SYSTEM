'use client'; // This directive marks the component as a Client Component

import Link from 'next/link';
import { useAuth } from '../AuthContext'; // Adjust path to AuthContext as needed

export default function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-gray-800 to-gray-900 text-white p-4 flex justify-between items-center shadow-lg">
      <div className="flex items-center space-x-4">
        <img
          src="/images.png"
          alt="OFFZONE Logo"
          className="h-10 w-10 rounded-full object-cover ring-2 ring-blue-400"
          style={{ background: 'white' }}
        />
        <h1 className="text-2xl font-extrabold tracking-wide">OFFZONE AI SYSTEM</h1>
      </div>
      <nav className="flex items-center space-x-6"> {/* Navigation links */}
        <Link href="/" className="text-white hover:text-blue-300 transition-colors duration-200 text-lg font-medium">
          Agent Management
        </Link>
        {user && user.role === 'admin' && (
          <Link href="/admin" className="text-white hover:text-blue-300 transition-colors duration-200 text-lg font-medium">
            Access Management
          </Link>
        )}
        <button
          onClick={logout}
          className="p-2 rounded-full bg-red-600 hover:bg-red-700 transition-all duration-300 shadow-md flex items-center justify-center group"
          title="Logout"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 15l3-3m0 0l-3-3m3 3H9" />
          </svg>
        </button>
      </nav>
    </header>
  );
}
