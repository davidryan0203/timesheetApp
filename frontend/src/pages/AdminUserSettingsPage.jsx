import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';

const AdminUserSettingsPage = () => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('staff');
  const [managerId, setManagerId] = useState('');
  const [managers, setManagers] = useState([]);
  const [ceos, setCeos] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadSupervisors = async () => {
      try {
        const [managersResponse, ceosResponse] = await Promise.all([
          api.get('/auth/managers'),
          api.get('/auth/ceos'),
        ]);
        setManagers(managersResponse.data || []);
        setCeos(ceosResponse.data || []);
      } catch {
        setManagers([]);
        setCeos([]);
      }
    };

    loadSupervisors();
  }, []);

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback('');
    const normalizedManagerId = String(managerId || '').trim();

    if (role === 'staff' && !normalizedManagerId) {
      setFeedback('Please select a manager for staff accounts.');
      return;
    }

    if (role === 'manager' && !normalizedManagerId) {
      setFeedback('Please select a CEO for manager accounts.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post('/auth/admin/create-user', {
        name,
        email,
        password,
        role,
        managerId: ['staff', 'manager'].includes(role) ? normalizedManagerId : undefined,
      });
      setFeedback(response.data?.message || 'User account created successfully.');
      setName('');
      setEmail('');
      setPassword('');
      setRole('staff');
      setManagerId('');
    } catch (error) {
      const firstValidationMessage = error.response?.data?.errors?.[0]?.msg;
      setFeedback(firstValidationMessage || error.response?.data?.message || 'Unable to create account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-emerald-50 to-white px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-800">Settings: Create User Account</h1>
          <Link to="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            Back to Dashboard
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Create staff, manager, CEO, HR, HR Head, or admin accounts.</p>

          {feedback ? <p className="mt-4 rounded-lg bg-slate-100 p-2 text-sm text-slate-800">{feedback}</p> : null}

          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="settingsName">
            Name
          </label>
          <input
            id="settingsName"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />

          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="settingsEmail">
            Email
          </label>
          <input
            id="settingsEmail"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />

          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="settingsPassword">
            Password
          </label>
          <input
            id="settingsPassword"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />

          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="settingsRole">
            Role
          </label>
          <select
            id="settingsRole"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              if (event.target.value !== 'staff') {
                setManagerId('');
              }
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="ceo">CEO</option>
            <option value="hr">HR</option>
            <option value="hr_head">HR Head</option>
            <option value="payroll">Payroll</option>
            <option value="admin">Admin</option>
          </select>

          {['staff', 'manager'].includes(role) ? (
            <>
              <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="settingsManagerId">
                {role === 'staff' ? 'Assigned Manager' : 'Assigned CEO'}
              </label>
              <select
                id="settingsManagerId"
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                required
              >
                <option value="">{role === 'staff' ? 'Select manager' : 'Select CEO'}</option>
                {(role === 'staff' ? managers : ceos).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} ({person.email})
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminUserSettingsPage;
