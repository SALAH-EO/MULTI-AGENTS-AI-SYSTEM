import { Suspense } from 'react'; // Import Suspense
import InitialPasswordClientPage from './InitialPasswordClientPage'; // Import the new client component

// This is now a Server Component by default (no 'use client' directive)
export default function InitialPasswordPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-700 dark:text-gray-300">Loading...</p>
      </div>
    }>
      <InitialPasswordClientPage />
    </Suspense>
  );
}
