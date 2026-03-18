import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import TimesheetTable from '../components/TimesheetTable';
import SubmittedTimesheetModal from '../components/SubmittedTimesheetModal';
import { formatRange, toISODate } from '../utils/date';

const TYPE_OPTIONS = ['Regular Hours', 'Overtime', 'Half Day', 'Sick Leave', 'Vacation Leave', 'Off Day'];

const getUtcDay = (dateInput) => {
  const date = new Date(dateInput);
  return date.getUTCDay();
};

const normalizeHours = (value, fallback = 0) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return Number(fallback.toFixed(2));
  }
  return Number(parsed.toFixed(2));
};

const getDefaultHours = (entryType) => {
  if (entryType === 'Off Day') {
    return 0;
  }
  if (entryType === 'Half Day') {
    return 3.75;
  }
  return 7.5;
};

const enforceWeekendOffDay = (entries = []) => {
  return entries.map((entry) => {
    const day = getUtcDay(entry.date);
    const isWeekend = day === 0 || day === 6;

    if (!isWeekend) {
      const normalizedType = entry.entryType || 'Regular Hours';
      return {
        ...entry,
        entryType: normalizedType,
        hours: normalizeHours(entry.hours, getDefaultHours(normalizedType)),
        overtimeHours:
          normalizedType === 'Overtime' ? normalizeHours(entry.overtimeHours, 0) : 0,
      };
    }

    return {
      ...entry,
      entryType: 'Off Day',
      hours: 0,
      overtimeHours: 0,
    };
  });
};

const StaffPanel = ({ user }) => {
  const [timesheet, setTimesheet] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [selectedSubmittedId, setSelectedSubmittedId] = useState('');
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const submittedTimesheets = useMemo(
    () => history.filter((item) => Boolean(item.submittedAt)),
    [history]
  );

  const draftTimesheets = useMemo(
    () => history.filter((item) => !item.submittedAt),
    [history]
  );

  const loadStaffData = useCallback(async () => {
    setLoading(true);
    setFeedback('');
    try {
      const recentResponse = await api.get('/timesheets/recent');
      const allTimesheets = recentResponse.data;
      const drafts = allTimesheets.filter((item) => !item.submittedAt);
      const submitted = allTimesheets.filter((item) => Boolean(item.submittedAt));

      setHistory(allTimesheets);
      setSelectedDraftId(drafts[0]?.id || '');
      setSelectedSubmittedId(submitted[0]?.id || '');
      setTimesheet(
        drafts[0]
          ? {
              ...drafts[0],
              entries: enforceWeekendOffDay(drafts[0].entries || []),
            }
          : null
      );
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load staff timesheets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaffData();
  }, [loadStaffData]);

  useEffect(() => {
    const selectedDraft = draftTimesheets.find((item) => item.id === selectedDraftId);
    if (!selectedDraft) {
      setTimesheet(null);
      return;
    }

    setTimesheet({
      ...selectedDraft,
      entries: enforceWeekendOffDay(selectedDraft.entries || []),
    });
  }, [selectedDraftId, draftTimesheets]);

  const onEntryChange = (index, field, value) => {
    setTimesheet((previous) => {
      if (!previous) {
        return previous;
      }

      const nextEntries = previous.entries.map((entry, entryIndex) => {
        if (entryIndex !== index) {
          return entry;
        }

        const day = getUtcDay(entry.date);
        const isWeekend = day === 0 || day === 6;
        if (isWeekend) {
          return {
            ...entry,
            entryType: 'Off Day',
            hours: 0,
            overtimeHours: 0,
          };
        }

        const nextEntry = { ...entry, [field]: value };
        if (field === 'entryType') {
          nextEntry.hours = getDefaultHours(value);
          nextEntry.overtimeHours = value === 'Overtime' ? normalizeHours(nextEntry.overtimeHours, 0) : 0;
        }
        if (field === 'hours') {
          nextEntry.hours = normalizeHours(value, getDefaultHours(nextEntry.entryType));
        }
        if (field === 'overtimeHours') {
          nextEntry.overtimeHours =
            nextEntry.entryType === 'Overtime' ? normalizeHours(value, 0) : 0;
        }

        return nextEntry;
      });

      const enforcedEntries = enforceWeekendOffDay(nextEntries);
      const totalHours = Number(
        enforcedEntries.reduce((acc, entry) => acc + (entry.hours || 0) + (entry.overtimeHours || 0), 0).toFixed(2)
      );

      return {
        ...previous,
        entries: enforcedEntries,
        totalHours,
      };
    });
  };

  const persistTimesheet = async (submit) => {
    if (!timesheet) {
      return;
    }

    if (submit) {
      const confirmed = window.confirm('Are you sure you want to submit this timesheet?');
      if (!confirmed) {
        return;
      }
    }

    setSaving(true);
    setFeedback('');

    try {
      const periodDate = new Date(timesheet.periodStart).toISOString().split('T')[0];
      const response = await api.post(`/timesheets/period/${periodDate}`, {
        entries: enforceWeekendOffDay(timesheet.entries),
        submit,
      });

      setTimesheet({
        ...response.data,
        entries: enforceWeekendOffDay(response.data.entries || []),
      });

      setFeedback(submit ? 'Timesheet submitted successfully.' : 'Draft saved.');
      await loadStaffData();
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to save timesheet');
    } finally {
      setSaving(false);
    }
  };

  const currentPeriodLabel = useMemo(() => {
    if (!timesheet) {
      return '';
    }
    return formatRange(timesheet.periodStart, timesheet.periodEnd);
  }, [timesheet]);

  return (
    <>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Staff Timesheet</h1>
            <p className="text-sm text-slate-600">{user.name} ({user.email})</p>
          </div>
          <p className="rounded-lg bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">Role: staff</p>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="assignedDrafts">
              Assigned Draft Timesheets
            </label>
            <select
              id="assignedDrafts"
              value={selectedDraftId}
              onChange={(event) => setSelectedDraftId(event.target.value)}
              className="mt-1 min-w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select assigned pay period</option>
              {draftTimesheets.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatRange(item.periodStart, item.periodEnd)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="submittedTimesheet">
              Submitted Timesheets
            </label>
            <select
              id="submittedTimesheet"
              value={selectedSubmittedId}
              onChange={(event) => setSelectedSubmittedId(event.target.value)}
              className="mt-1 min-w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select submitted pay period</option>
              {submittedTimesheets.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatRange(item.periodStart, item.periodEnd)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              const selected = submittedTimesheets.find((item) => item.id === selectedSubmittedId);
              if (selected) {
                setViewingTimesheet(selected);
              }
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            View Submitted
          </button>
        </div>
      </header>

      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">Loading timesheet...</section>
      ) : timesheet ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Assigned Bi-weekly Sheet</h2>
              <p className="text-sm text-slate-600">Current period: {currentPeriodLabel}</p>
            </div>
            <p className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
              Total Hours: {timesheet.totalHours?.toFixed(2) || '0.00'}
            </p>
          </div>

          <TimesheetTable entries={timesheet.entries} typeOptions={TYPE_OPTIONS} onEntryChange={onEntryChange} />

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => persistTimesheet(false)}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => persistTimesheet(true)}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Submitting...' : 'Submit Timesheet'}
            </button>
          </div>

          {feedback ? <p className="text-sm text-slate-700">{feedback}</p> : null}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">No Assigned Draft</h2>
          <p className="mt-1 text-sm text-slate-600">
            Wait for the dispatcher to send out the next pay period timesheet.
          </p>
          {feedback ? <p className="mt-3 text-sm text-slate-700">{feedback}</p> : null}
        </section>
      )}

      <SubmittedTimesheetModal timesheet={viewingTimesheet} onClose={() => setViewingTimesheet(null)} />
    </>
  );
};

const DispatcherPanel = ({ user }) => {
  const [periodFrom, setPeriodFrom] = useState(toISODate(new Date()));
  const [periodTo, setPeriodTo] = useState(toISODate(new Date(Date.now() + 13 * 24 * 60 * 60 * 1000)));
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');

  const loadStatus = useCallback(async (fromValue, toValue) => {
    setLoading(true);
    try {
      const response = await api.get('/timesheets/dispatch/status', {
        params: {
          from: fromValue,
          to: toValue,
        },
      });
      setStatusData(response.data);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load submission status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus(periodFrom, periodTo);
  }, [periodFrom, periodTo, loadStatus]);

  const sendOut = async () => {
    setSending(true);
    setFeedback('');

    try {
      const response = await api.post('/timesheets/dispatch/send-out', {
        periodFrom,
        periodTo,
      });
      setFeedback(
        `${response.data.message} Created: ${response.data.createdCount}, Already Assigned: ${response.data.alreadyAssignedCount}`
      );
      await loadStatus(periodFrom, periodTo);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to send out timesheets');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Dispatcher Panel</h1>
            <p className="text-sm text-slate-600">{user.name} ({user.email})</p>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">Role: dispatcher</p>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="dispatchFrom">
              Pay Period From
            </label>
            <input
              id="dispatchFrom"
              type="date"
              value={periodFrom}
              onChange={(event) => setPeriodFrom(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="dispatchTo">
              Pay Period To
            </label>
            <input
              id="dispatchTo"
              type="date"
              value={periodTo}
              onChange={(event) => setPeriodTo(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={sendOut}
            disabled={sending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send Out Timesheets'}
          </button>
        </div>

        {feedback ? <p className="mt-3 text-sm text-slate-700">{feedback}</p> : null}
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Submission Tracking</h2>
        {statusData ? (
          <p className="mt-1 text-sm text-slate-600">
            Period: {formatRange(statusData.periodStart, statusData.periodEnd)}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-3 text-sm text-slate-700">Loading status...</p>
        ) : statusData?.statuses?.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {statusData.statuses.map((row) => (
                  <tr key={row.user.id} className="border-t border-slate-100 text-slate-700">
                    <td className="px-3 py-2">{row.user.name}</td>
                    <td className="px-3 py-2">{row.user.email}</td>
                    <td className="px-3 py-2">{row.assigned ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">{row.submitted ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">
                      {row.submittedAt ? dayjs(row.submittedAt).format('MMM D, YYYY h:mm A') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No staff status found for this period.</p>
        )}
      </section>
    </>
  );
};

const AdminPanel = ({ user }) => {
  const [submittedTimesheets, setSubmittedTimesheets] = useState([]);
  const [statusFrom, setStatusFrom] = useState(toISODate(new Date()));
  const [statusTo, setStatusTo] = useState(toISODate(new Date(Date.now() + 13 * 24 * 60 * 60 * 1000)));
  const [statusData, setStatusData] = useState(null);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  const loadAdminData = useCallback(async (fromValue, toValue) => {
    setLoading(true);
    setFeedback('');

    try {
      const [submittedResponse, statusResponse] = await Promise.all([
        api.get('/timesheets/admin/submitted'),
        api.get('/timesheets/dispatch/status', {
          params: {
            from: fromValue,
            to: toValue,
          },
        }),
      ]);
      setSubmittedTimesheets(submittedResponse.data);
      setStatusData(statusResponse.data);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData(statusFrom, statusTo);
  }, [statusFrom, statusTo, loadAdminData]);

  return (
    <>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Administrator Panel</h1>
            <p className="text-sm text-slate-600">{user.name} ({user.email})</p>
          </div>
          <p className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">Role: admin</p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Submitted Timesheets (All Staff)</h2>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="adminStatusFrom">
              Status From
            </label>
            <input
              id="adminStatusFrom"
              type="date"
              value={statusFrom}
              onChange={(event) => setStatusFrom(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="adminStatusTo">
              Status To
            </label>
            <input
              id="adminStatusTo"
              type="date"
              value={statusTo}
              onChange={(event) => setStatusTo(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        {feedback ? <p className="mt-3 text-sm text-slate-700">{feedback}</p> : null}

        {loading ? (
          <p className="mt-3 text-sm text-slate-700">Loading admin data...</p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Staff</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Total Hours</th>
                    <th className="px-3 py-2">Submitted At</th>
                    <th className="px-3 py-2">View</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedTimesheets.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                      <td className="px-3 py-2">{item.user?.name || 'Unknown User'}</td>
                      <td className="px-3 py-2">{formatRange(item.periodStart, item.periodEnd)}</td>
                      <td className="px-3 py-2">{Number(item.totalHours || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {item.submittedAt ? dayjs(item.submittedAt).format('MMM D, YYYY h:mm A') : '-'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setViewingTimesheet(item)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 overflow-x-auto">
              <h3 className="text-base font-semibold text-slate-800">Submission Status by Pay Period</h3>
              {statusData ? (
                <p className="mt-1 text-sm text-slate-600">
                  Period: {formatRange(statusData.periodStart, statusData.periodEnd)}
                </p>
              ) : null}
              <table className="mt-2 min-w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Staff</th>
                    <th className="px-3 py-2">Assigned</th>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2">Submitted At</th>
                  </tr>
                </thead>
                <tbody>
                  {(statusData?.statuses || []).map((row) => (
                    <tr key={`status-${row.user.id}`} className="border-t border-slate-100 text-slate-700">
                      <td className="px-3 py-2">{row.user.name}</td>
                      <td className="px-3 py-2">{row.assigned ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">{row.submitted ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">
                        {row.submittedAt ? dayjs(row.submittedAt).format('MMM D, YYYY h:mm A') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <SubmittedTimesheetModal timesheet={viewingTimesheet} onClose={() => setViewingTimesheet(null)} />
    </>
  );
};

const RoleDashboardPage = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-emerald-50 to-white px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex justify-end">
          <button
            onClick={logout}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Logout
          </button>
        </div>

        {user?.role === 'admin' ? <AdminPanel user={user} /> : null}
        {user?.role === 'dispatcher' ? <DispatcherPanel user={user} /> : null}
        {user?.role === 'staff' ? <StaffPanel user={user} /> : null}
      </div>
    </div>
  );
};

export default RoleDashboardPage;
