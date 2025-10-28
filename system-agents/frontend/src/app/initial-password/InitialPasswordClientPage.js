'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../AuthContext'; // Correct path
import ErrorModal from '../components/ErrorModal'; // Correct path

export default function InitialPasswordClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth(); // Only need 'login' now, not setToken/setUser directly here
  
  const [modal, setModal] = useState({ show: false, message: '', title: '' });
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null); // Store the token from URL
  const [username, setUsername] = useState(''); // Store username after token validation
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false); // Control form visibility

  const showErrorModal = (title, message = '') => {
    setModal({ show: true, title, message });
  };

  const closeModal = () => {
    setModal({ show: false, title: '', message: '' });
    // After closing modal for error (e.g., invalid/expired link), redirect to login
    if (modal.title === 'Error' || modal.title === 'Invalid Link') {
      router.push('/login');
    }
  };

  useEffect(() => {
    const urlToken = searchParams.get('token');

    if (!urlToken) {
      showErrorModal('Invalid Link', 'No one-time login token found in the URL. Please ensure you clicked the full link from the email.');
      setLoading(false);
      return;
    }

    setToken(urlToken); // Store the token from the URL

    const validateOneTimeToken = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/auth/validate-one-time-token?token=${urlToken}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.detail || 'Failed to validate one-time link.');
        }

        const data = await res.json();
        setUsername(data.username); // Store the username
        setShowPasswordForm(true); // Show the password setting form
        setLoading(false);

      } catch (error) {
        console.error('One-time token validation error:', error);
        showErrorModal('Error', error.message || 'The one-time login link is invalid or expired. Please request a new one.');
        setLoading(false);
      }
    };

    validateOneTimeToken();
  }, [searchParams]); // Depend only on searchParams for initial load

  const handleSubmitNewPassword = async (e) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      showErrorModal('Validation Error', 'Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showErrorModal('Validation Error', 'Passwords do not match.');
      return;
    }

    try {
      // Call backend to set the new password and invalidate the token
      const res = await fetch('http://127.0.0.1:8000/api/auth/set-password-with-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to set new password.');
      }

      // If password set successfully, now log the user in with the new password
      const loginSuccess = await login(username, newPassword);
      if (loginSuccess) {
        showErrorModal('Success', 'Password set successfully and logged in! Redirecting to dashboard...');
        // The login function in AuthContext already handles redirection
      } else {
        showErrorModal('Login Failed', 'Password set, but automatic login failed. Please try logging in manually.');
        router.push('/login'); // Redirect to login page if auto-login fails
      }

    } catch (error) {
      console.error('Error setting new password:', error);
      showErrorModal('Error', error.message || 'An unexpected error occurred while setting your password.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-700 dark:text-gray-300">Validating one-time login link...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Set Your New Password</h2>
        {showPasswordForm ? (
          <form onSubmit={handleSubmitNewPassword} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 text-left">New Password</label>
              <input
                type="password"
                id="new-password"
                className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 text-left">Confirm New Password</label>
              <input
                type="password"
                id="confirm-password"
                className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Set Password & Log In
            </button>
          </form>
        ) : (
          <p className="text-gray-600 dark:text-gray-300">
            Please wait while we validate your link...
          </p>
        )}
      </div>
      <ErrorModal show={modal.show} title={modal.title} message={modal.message} onClose={closeModal} />
    </div>
  );
}
