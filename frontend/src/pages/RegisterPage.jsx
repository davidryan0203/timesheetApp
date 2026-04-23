import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

const RegisterPage = () => {
  const navigate = useNavigate();
  const { register, isAuthenticated } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('staff');
  const [managerId, setManagerId] = useState('');
  const [managers, setManagers] = useState([]);
  const [ceos, setCeos] = useState([]);
  const [error, setError] = useState('');
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

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const normalizedManagerId = String(managerId || '').trim();

    if (role === 'staff' && !normalizedManagerId) {
      setError('Please select a manager for staff accounts.');
      setSubmitting(false);
      return;
    }

    if (role === 'manager' && !normalizedManagerId) {
      setError('Please select a CEO for manager accounts.');
      setSubmitting(false);
      return;
    }

    setSubmitting(true);

    try {
      await register({
        name,
        email,
        password,
        role,
        managerId: ['staff', 'manager'].includes(role) ? normalizedManagerId : undefined,
      });
      navigate('/');
    } catch (requestError) {
      const firstValidationMessage = requestError.response?.data?.errors?.[0]?.msg;
      setError(firstValidationMessage || requestError.response?.data?.message || 'Unable to register');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
      <div className="flex w-full flex-1 flex-col space-y-4">
        <div className="flex justify-center">
          <img src="/logo.png" alt="Company Logo" className="h-16 w-auto object-contain" />
        </div>

        <form onSubmit={handleSubmit} className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <h1 className="text-2xl font-semibold text-slate-800">Create Account</h1>
          <p className="mt-1 text-sm text-slate-500">Start tracking your hours in one place.</p>

        {error ? <p className="mt-4 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />

        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />

        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />

        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="role">
          Role
        </label>
        <select
          id="role"
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
          <option value="admin">Admin</option>
        </select>

        {['staff', 'manager'].includes(role) ? (
          <>
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="managerId">
              {role === 'staff' ? 'Assigned Manager' : 'Assigned CEO'}
            </label>
            <select
              id="managerId"
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
          {submitting ? 'Creating account...' : 'Register'}
        </button>

          <p className="mt-4 text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-slate-900 underline">
              Login
            </Link>
          </p>
        </form>

        <footer className="mt-auto rounded-xl border border-slate-200 bg-white/70 p-3 text-center text-xs text-slate-600">
          <p>For any technical issues, contact: Dexter Dancel</p>
          <p>For HR related concern: Michelle Martin</p>
          <p>DEVELOPED BY: MTIE - IT</p>
        </footer>
      </div>
    </div>
  );
};

export default RegisterPage;
