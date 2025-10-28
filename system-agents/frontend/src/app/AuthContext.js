'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ErrorModal from './components/ErrorModal'; // Import the new ErrorModal component

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null); // This will now store the full user object { username, role, workflow_access }
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ show: false, message: '', title: '' });
  const router = useRouter();

  const showErrorModal = (title, message = '') => {
    console.error(`Error Modal Displayed: ${title} - ${message}`);
    setModal({ show: true, title, message });
  };

  const closeModal = () => {
    setModal({ show: false, title: '', message: '' });
  };

  useEffect(() => {
    console.log('AuthContext: Initializing, checking for stored token and user data...');
    const storedToken = localStorage.getItem('jwt_token');
    const storedUser = localStorage.getItem('user'); // Retrieve stored user object
    
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
        console.log('AuthContext: Token and user data found in localStorage.', parsedUser);
      } catch (e) {
        console.error('AuthContext: Error parsing stored user data from localStorage:', e);
        // Clear corrupted data
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
      }
    } else {
      console.log('AuthContext: No token or user data found in localStorage.');
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    console.log('AuthContext: Attempting login for user:', username);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      console.log('AuthContext: Login API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('AuthContext: Login API error response data:', errorData);
        throw new Error(errorData.detail || 'Login failed');
      }

      const data = await response.json();
      console.log('AuthContext: Login API successful response data:', data);

      // Store token and the full user object
      localStorage.setItem('jwt_token', data.access_token);
      localStorage.setItem('user', JSON.stringify({
        username: data.username,
        role: data.role,
        workflow_access: data.workflow_access
      }));
      
      setToken(data.access_token);
      setUser({
        username: data.username,
        role: data.role,
        workflow_access: data.workflow_access
      });

      console.log('AuthContext: Login successful, checking role for redirection...');
      if (data.role === 'admin') {
        router.push('/admin'); // Redirect admin to the admin page
      } else {
        router.push('/'); // Redirect regular users to home page
      }
      return true;
    } catch (error) {
      console.error('AuthContext: Login error caught:', error);
      showErrorModal('Login Error', error.message);
      return false;
    }
  };

  const logout = () => {
    console.log('AuthContext: Logging out...');
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user'); // Clear user data on logout
    setToken(null);
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, setToken, setUser }}> {/* ADDED setToken and setUser here */}
      {children}
      <ErrorModal show={modal.show} title={modal.title} message={modal.message} onClose={closeModal} />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
