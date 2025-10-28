'use client';

import { useEffect, useState, useRef } from 'react'; // Import useRef
import { useRouter } from 'next/navigation';
import { useAuth } from '../AuthContext';
import ErrorModal from '../components/ErrorModal';

export default function AdminPage() {
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState([]);
  const [workflows, setWorkflows] = useState([]); // To store all available workflows
  const [modal, setModal] = useState({ show: false, message: '', title: '' });
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', workflow_ids: [] });
  const [editingUser, setEditingUser] = useState(null); // User currently being edited
  const originalEditingUserRef = useRef(null); // To store the original user data for comparison

  const showErrorModal = (title, message = '') => {
    console.log('Attempting to show error modal:', { title, message }); // Debug log
    setModal({ show: true, title, message });
  };

  const closeModal = () => {
    setModal({ show: false, title: '', message: '' });
  };

  // Redirect if not authenticated or not an admin
  useEffect(() => {
    if (!loading && (!token || user?.role !== 'admin')) {
      router.push('/login');
    }
  }, [token, user, loading, router]);

  // Fetch all users
  const fetchUsers = async () => {
    if (!token) return;
    try {
      const res = await fetch('http://127.0.0.1:8000/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          logout();
          throw new Error('Unauthorized or Forbidden. Please log in as admin.');
        }
        throw new Error(`Failed to fetch users: ${res.statusText}`);
      }
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
      showErrorModal('Error', error.message || 'Failed to fetch users.');
    }
  };

  // Fetch all workflows
  const fetchWorkflows = async () => {
    if (!token) return;
    try {
      const res = await fetch('http://127.0.0.1:8000/api/all_workflows', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        if (res.status === 401) {
            logout();
            throw new Error('Unauthorized. Please log in again.');
        }
        throw new Error(`Failed to fetch workflows: ${res.statusText}`);
      }
      const data = await res.json();
      setWorkflows(data);
    } catch (error) {
      console.error('Error fetching workflows:', error);
      showErrorModal('Error', error.message || 'Failed to fetch workflows.');
    }
  };

  useEffect(() => {
    if (token && user?.role === 'admin') {
      fetchUsers();
      fetchWorkflows();
    }
  }, [token, user]);

  const handleAddUserChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setNewUser(prev => {
        const updatedWorkflows = checked
          ? [...prev.workflow_ids, value]
          : prev.workflow_ids.filter(id => id !== value);
        return { ...prev, workflow_ids: updatedWorkflows };
      });
    } else {
      setNewUser(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleEditUserChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setEditingUser(prev => {
        const updatedWorkflows = checked
          ? [...prev.workflow_access, value]
          : prev.workflow_access.filter(id => id !== value);
        return { ...prev, workflow_access: updatedWorkflows };
      });
    } else {
      setEditingUser(prev => ({ ...prev, [name]: value }));
    }
  };

  // Function to open the edit user modal and store original data
  const openEditUserModal = (userItem) => {
    setEditingUser({ ...userItem }); // Set a copy for editing
    originalEditingUserRef.current = { ...userItem }; // Store the original for comparison
    setShowEditUserModal(true);
  };

  const handleAddUserSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation for password length and email format
    if (newUser.password.length < 8) {
      console.log('Validation: Password too short. Showing error modal.'); // Debug log
      showErrorModal('Validation Error', 'Password must be at least 8 characters long.');
      return;
    }
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUser.username)) {
      console.log('Validation: Invalid email format. Showing error modal.'); // Debug log
      showErrorModal('Validation Error', 'Please enter a valid email address for the username.');
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newUser),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to add user.');
      }

      // Updated success message to reflect one-time login link
      showErrorModal('Success', 'User added successfully! A one-time login link has been sent to the user\'s email.');
      setShowAddUserModal(false);
      setNewUser({ username: '', password: '', role: 'user', workflow_ids: [] }); // Reset form
      fetchUsers(); // Refresh user list
    } catch (error) {
      console.error('Error adding user:', error);
      showErrorModal('Error', error.message || 'Failed to add user.');
    }
  };

  const handleEditUserSubmit = async (e) => {
    e.preventDefault();
    if (!editingUser || !originalEditingUserRef.current) return;

    let changesMade = false;

    try {
      // Check and update role if changed
      if (editingUser.role !== originalEditingUserRef.current.role) {
        console.log(`Role changed for ${editingUser.username}: ${originalEditingUserRef.current.role} -> ${editingUser.role}`);
        const roleRes = await fetch(`http://127.0.0.1:8000/api/admin/users/${editingUser.username}/role?new_role=${editingUser.role}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!roleRes.ok) {
          const errorData = await roleRes.json();
          // If the role is already set to the new role, treat it as success for this part
          if (roleRes.status === 400 && errorData.detail && errorData.detail.includes("User role not updated (perhaps already set")) {
            console.warn(`Role for ${editingUser.username} was already set to ${editingUser.role}. Proceeding.`);
          } else {
            throw new Error(errorData.detail || 'Failed to update user role.');
          }
        } else {
          changesMade = true;
        }
      } else {
        console.log(`Role for ${editingUser.username} is unchanged.`);
      }

      // Check and update workflow access if changed
      const currentAccessSet = new Set(editingUser.workflow_access.sort());
      const originalAccessSet = new Set(originalEditingUserRef.current.workflow_access.sort());

      const accessChanged = (currentAccessSet.size !== originalAccessSet.size) ||
                            ![...currentAccessSet].every(item => originalAccessSet.has(item));

      if (accessChanged) {
        console.log(`Workflow access changed for ${editingUser.username}.`);
        const accessRes = await fetch(`http://127.0.0.1:8000/api/admin/users/${editingUser.username}/workflow_access`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ workflow_ids: editingUser.workflow_access }),
        });
        if (!accessRes.ok) {
          const errorData = await accessRes.json();
          throw new Error(errorData.detail || 'Failed to update user workflow access.');
        } else {
          changesMade = true;
        }
      } else {
        console.log(`Workflow access for ${editingUser.username} is unchanged.`);
      }

      if (changesMade) {
        showErrorModal('Success', 'User updated successfully!');
      } else {
        showErrorModal('Info', 'No changes detected for the user.');
      }
      
      setShowEditUserModal(false);
      setEditingUser(null);
      originalEditingUserRef.current = null; // Clear the ref
      fetchUsers(); // Refresh user list
    } catch (error) {
      console.error('Error updating user:', error);
      showErrorModal('Error', error.message || 'Failed to update user.');
    }
  };

  const handleDeleteUser = async (usernameToDelete) => {
    // Replaced confirm() with custom modal for consistency and better UX
    // In a real app, you'd use a state variable to show a custom confirmation modal
    // For now, I'll use a placeholder for the confirmation logic.
    const isConfirmed = window.confirm(`Are you sure you want to delete user ${usernameToDelete}?`); // Using window.confirm for simplicity, replace with custom modal
    if (!isConfirmed) {
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/admin/users/${usernameToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to delete user.');
      }

      showErrorModal('Success', 'User deleted successfully!');
      fetchUsers(); // Refresh user list
    } catch (error) {
      console.error('Error deleting user:', error);
      showErrorModal('Error', error.message || 'Failed to delete user.');
    }
  };

  if (loading || user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-700 dark:text-gray-300">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-8 pt-20"> {/* Added pt-20 for header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white p-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <img
            src="/images.png"
            alt="OFFZONE Logo"
            className="h-10 w-10 rounded-full object-cover ring-2 ring-blue-400"
            style={{ background: 'white' }}
          />
          <h1 className="text-lg font-bold">OFFZONE AI SYSTEM</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/')}
            className="py-1 px-3 bg-blue-600 rounded-md hover:bg-blue-700 transition-colors text-sm"
          >
            Dashboard
          </button>
          <button
            onClick={logout}
            className="logout-btn"
            title="Logout"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 15l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </header>

      <h1 className="text-4xl font-bold mb-8 text-center">Admin Panel</h1>

      <ErrorModal show={modal.show} title={modal.title} message={modal.message} onClose={closeModal} />

      {/* Add User Button */}
      <div className="mb-8 text-center">
        <button
          onClick={() => setShowAddUserModal(true)}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition-colors"
        >
          Add New User
        </button>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">Add New User</h2>
            <form onSubmit={handleAddUserSubmit} className="space-y-4">
              <div>
                <label htmlFor="add-username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Username (Email)</label>
                <input
                  type="email"
                  id="add-username"
                  name="username"
                  value={newUser.username}
                  onChange={handleAddUserChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              <div>
                <label htmlFor="add-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <input
                  type="password"
                  id="add-password"
                  name="password"
                  value={newUser.password}
                  onChange={handleAddUserChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              <div>
                <label htmlFor="add-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                <select
                  id="add-role"
                  name="role"
                  value={newUser.role}
                  onChange={handleAddUserChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Workflow Access</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                  {workflows.map(wf => (
                    <div key={wf.id} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`add-wf-${wf.id}`}
                        name="workflow_ids"
                        value={wf.id}
                        checked={newUser.workflow_ids.includes(wf.id)}
                        onChange={handleAddUserChange}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`add-wf-${wf.id}`} className="ml-2 text-sm text-gray-900 dark:text-gray-100">
                        {wf.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-md hover:bg-gray-400 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm transition-colors"
                >
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && editingUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">Edit User: {editingUser.username}</h2>
            <form onSubmit={handleEditUserSubmit} className="space-y-4">
              <div>
                <label htmlFor="edit-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                <select
                  id="edit-role"
                  name="role"
                  value={editingUser.role}
                  onChange={handleEditUserChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Workflow Access</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                  {workflows.map(wf => (
                    <div key={wf.id} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`edit-wf-${wf.id}`}
                        name="workflow_access"
                        value={wf.id}
                        checked={editingUser.workflow_access.includes(wf.id)}
                        onChange={handleEditUserChange}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`edit-wf-${wf.id}`} className="ml-2 text-sm text-gray-900 dark:text-gray-100">
                        {wf.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => { setShowEditUserModal(false); setEditingUser(null); originalEditingUserRef.current = null; }}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-md hover:bg-gray-400 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Username
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Role
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Workflow Access
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((userItem) => (
              <tr key={userItem.username}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                  {userItem.username}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {userItem.role}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                  {userItem.workflow_access.length > 0
                    ? userItem.workflow_access.map(id => workflows.find(wf => wf.id === id)?.name || id).join(', ')
                    : 'None'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => openEditUserModal(userItem)} // Use the new function here
                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-600 mr-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteUser(userItem.username)}
                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
