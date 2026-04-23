import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback('');
    setIsError(false);

    if (!token) {
      setIsError(true);
      setFeedback('Invalid reset link. Please request a new password reset email.');
      return;
    }

    if (password !== confirmPassword) {
      setIsError(true);
      setFeedback('Password and confirm password do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post('/auth/reset-password', {
        token,
        password,
        confirmPassword,
      });
      logout();
      navigate('/login', {
        replace: true,
        state: {
          successMessage: response.data?.message || 'Password reset successful. You can now log in.',
        },
      });
    } catch (error) {
      setIsError(true);
      setFeedback(error.response?.data?.message || 'Unable to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-28 pt-6">
      <div className="flex w-full flex-1 flex-col space-y-4">
        <div className="flex justify-center">
          <img src="/logo.png" alt="Company Logo" className="h-16 w-auto object-contain" />
        </div>

        <form onSubmit={handleSubmit} className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <h1 className="text-2xl font-semibold text-slate-800">Reset Password</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your new password to complete the reset.</p>

          {feedback ? (
            <p className={`mt-4 rounded-lg p-2 text-sm ${isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {feedback}
            </p>
          ) : null}

          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="password">
            New Password
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

          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="confirmPassword">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Updating...' : 'Update Password'}
          </button>

          <p className="mt-4 text-sm text-slate-600">
            Back to{' '}
            <Link to="/login" className="font-medium text-slate-900 underline">
              Login
            </Link>
          </p>
        </form>

        <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 text-xs text-slate-600 backdrop-blur">
          <div className="mx-auto w-full max-w-md text-center">
            <p>For any technical issues, contact: Dexter Dancel</p>
            <p>For HR related concern: Michelle Martin</p>
            <p>DEVELOPED BY: MTIE - IT</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
