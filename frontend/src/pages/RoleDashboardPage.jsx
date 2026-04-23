import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import TimesheetTable from '../components/TimesheetTable';
import SubmittedTimesheetModal from '../components/SubmittedTimesheetModal';
import { formatDateLabel, formatDayLabel, formatRange, toISODate } from '../utils/date';

const TYPE_OPTIONS = [
  'Regular Hours',
  'Overtime',
  'Half Day - Morning',
  'Half Day - Afternoon',
  'Sick Leave',
  'Vacation Leave',
  'Off Day',
];

const STATUS_LABELS = {
  draft: 'Draft',
  pending_manager: 'Pending Manager',
  manager_approved: 'Approved by Manager',
  manager_rejected: 'Rejected by Manager',
  hr_head_approved: 'Approved by HR Head',
  hr_head_rejected: 'Rejected by HR Head',
  pending_ceo: 'Pending CEO',
  ceo_approved: 'Approved by CEO',
  ceo_rejected: 'Rejected by CEO',
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
  if (entryType === 'Half Day - Morning') {
    return 4;
  }
  if (entryType === 'Half Day - Afternoon') {
    return 3;
  }
  if (entryType === 'Half Day') {
    return 3.5;
  }
  return 7;
};

const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const printSubmittedTimesheet = (timesheet, onError) => {
  if (!timesheet) {
    return;
  }

  const rowsHtml = (timesheet.entries || [])
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(formatDateLabel(entry.dateOnly || entry.date))}</td>
          <td>${escapeHtml(formatDayLabel(entry.dateOnly || entry.date))}</td>
          <td>${escapeHtml(entry.entryType || 'Regular Hours')}</td>
          <td>${Number(entry.hours || 0).toFixed(2)}</td>
          <td>${Number(entry.overtimeHours || 0).toFixed(2)}</td>
          <td>${escapeHtml(entry.notes || '-')}</td>
        </tr>
      `
    )
    .join('');

  const safeRowsHtml = rowsHtml || '<tr><td colspan="6">No entries found</td></tr>';

  const submittedLabel = timesheet.submittedAt ? dayjs(timesheet.submittedAt).format('MMM D, YYYY h:mm A') : '-';
  const approvedLabel = timesheet.hrHeadReviewedAt
    ? dayjs(timesheet.hrHeadReviewedAt).format('MMM D, YYYY h:mm A')
    : '-';

  const html = `<!doctype html>
    <html>
      <head>
        <title></title>
        <meta charset="utf-8" />
        <style>
          @page { margin: 12mm; }
          body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
          h1 { margin: 0 0 8px; }
          .meta { margin: 0 0 4px; font-size: 14px; color: #334155; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #f1f5f9; }
          .total { margin-top: 12px; font-weight: 700; }
        </style>
      </head>
      <body>
        <h1>HR Head Approved Timesheet</h1>
        <p class="meta">Staff: ${escapeHtml(timesheet.user?.name || 'Unknown')} (${escapeHtml(timesheet.user?.email || '-')})</p>
        <p class="meta">Period: ${escapeHtml(formatRange(timesheet.periodStart, timesheet.periodEnd))}</p>
        <p class="meta">Submitted: ${escapeHtml(submittedLabel)}</p>
        <p class="meta">HR Head Approved: ${escapeHtml(approvedLabel)}</p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Type</th>
              <th>Hours</th>
              <th>Overtime</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${safeRowsHtml}</tbody>
        </table>
        <p class="total">Total Hours: ${Number(timesheet.totalHours || 0).toFixed(2)}</p>
      </body>
    </html>
  `;

  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'timesheet-print-frame');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    const cleanup = () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    iframe.onload = () => {
      const contentWindow = iframe.contentWindow;
      if (!contentWindow) {
        cleanup();
        onError?.('Unable to prepare the print preview. Please try again.');
        return;
      }

      // Cleanup after the print dialog closes.
      contentWindow.onafterprint = cleanup;

      setTimeout(() => {
        try {
          contentWindow.focus();
          contentWindow.print();
          // Fallback cleanup if onafterprint is not triggered.
          setTimeout(cleanup, 2000);
        } catch {
          cleanup();
          onError?.('Unable to print this report. Please try again.');
        }
      }, 100);
    };

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  } catch {
    onError?.('Unable to prepare the print report. Please try again.');
  }
};

const normalizeEntriesForUi = (entries = []) => {
  return entries.map((entry) => {
    const normalizedType = entry.entryType || 'Regular Hours';
    return {
      ...entry,
      entryType: normalizedType,
      hours: normalizeHours(entry.hours, getDefaultHours(normalizedType)),
      overtimeHours: normalizedType === 'Overtime' ? normalizeHours(entry.overtimeHours, 0) : 0,
    };
  });
};

const ApprovalBadge = ({ status }) => {
  return (
    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {STATUS_LABELS[status] || status || 'Draft'}
    </span>
  );
};

const StaffPanel = ({
  user,
  panelTitle = 'Staff Timesheet',
  roleLabel = 'staff',
  submitTargetLabel = 'manager',
  loadErrorText = 'Unable to load staff timesheets',
}) => {
  const [timesheet, setTimesheet] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [selectedSubmittedId, setSelectedSubmittedId] = useState('');
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const submittedTimesheets = useMemo(() => history.filter((item) => Boolean(item.submittedAt)), [history]);

  const draftTimesheets = useMemo(
    () =>
      history.filter((item) =>
        !item.submittedAt || ['manager_rejected', 'ceo_rejected', 'hr_head_rejected'].includes(item.status)
      ),
    [history]
  );

  const loadStaffData = useCallback(async () => {
    setLoading(true);
    setFeedback('');
    try {
      const recentResponse = await api.get('/timesheets/recent');
      const allTimesheets = recentResponse.data;
      const drafts = allTimesheets.filter(
        (item) =>
          !item.submittedAt || ['manager_rejected', 'ceo_rejected', 'hr_head_rejected'].includes(item.status)
      );
      const submitted = allTimesheets.filter((item) => Boolean(item.submittedAt));

      setHistory(allTimesheets);
      setSelectedDraftId(drafts[0]?.id || '');
      setSelectedSubmittedId(submitted[0]?.id || '');
      setTimesheet(
        drafts[0]
          ? {
              ...drafts[0],
              entries: normalizeEntriesForUi(drafts[0].entries || []),
            }
          : null
      );
    } catch (error) {
      setFeedback(error.response?.data?.message || loadErrorText);
    } finally {
      setLoading(false);
    }
  }, [loadErrorText]);

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
      entries: normalizeEntriesForUi(selectedDraft.entries || []),
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

        const nextEntry = { ...entry, [field]: value };
        if (field === 'entryType') {
          nextEntry.hours = getDefaultHours(value);
          nextEntry.overtimeHours = value === 'Overtime' ? normalizeHours(nextEntry.overtimeHours, 0) : 0;
        }
        if (field === 'hours') {
          nextEntry.hours = normalizeHours(value, getDefaultHours(nextEntry.entryType));
        }
        if (field === 'overtimeHours') {
          nextEntry.overtimeHours = nextEntry.entryType === 'Overtime' ? normalizeHours(value, 0) : 0;
        }

        return nextEntry;
      });

      const normalizedEntries = normalizeEntriesForUi(nextEntries);
      const totalHours = Number(
        normalizedEntries.reduce((acc, entry) => acc + (entry.hours || 0) + (entry.overtimeHours || 0), 0).toFixed(2)
      );

      return {
        ...previous,
        entries: normalizedEntries,
        totalHours,
      };
    });
  };

  const persistTimesheet = async (submit) => {
    if (!timesheet) {
      return;
    }

    if (submit) {
      const confirmed = window.confirm(`Are you sure you want to submit this timesheet to ${submitTargetLabel}?`);
      if (!confirmed) {
        return;
      }
    }

    setSaving(true);
    setFeedback('');

    try {
      const periodDate = toISODate(timesheet.periodStart);
      const response = await api.post(`/timesheets/period/${periodDate}`, {
        entries: normalizeEntriesForUi(timesheet.entries),
        submit,
      });

      setTimesheet({
        ...response.data,
        entries: normalizeEntriesForUi(response.data.entries || []),
      });

      setFeedback(submit ? `Timesheet submitted to ${submitTargetLabel}.` : 'Draft saved.');
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
            <h1 className="text-2xl font-semibold text-slate-800">{panelTitle}</h1>
            <p className="text-sm text-slate-600">{user.name} ({user.email})</p>
          </div>
          <p className="rounded-lg bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">Role: {roleLabel}</p>
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
              <div className="mt-1">
                <ApprovalBadge status={timesheet.status} />
              </div>
              {timesheet.managerComment ? (
                <p className="mt-2 text-sm text-rose-700">Manager note: {timesheet.managerComment}</p>
              ) : null}
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
            Wait for HR to send out the next pay period timesheet.
          </p>
          {feedback ? <p className="mt-3 text-sm text-slate-700">{feedback}</p> : null}
        </section>
      )}

      <SubmittedTimesheetModal timesheet={viewingTimesheet} onClose={() => setViewingTimesheet(null)} />
    </>
  );
};

const HRPanel = ({ user }) => {
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [statusData, setStatusData] = useState(null);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [printableTimesheets, setPrintableTimesheets] = useState([]);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const filterStorageKey = `hr-dispatch-period-${user?.id || user?._id || 'default'}`;

  const loadStatus = useCallback(async (fromValue, toValue) => {
    setLoading(true);
    try {
      const [statusResponse, hrReviewResponse, printableResponse] = await Promise.all([
        api.get('/timesheets/dispatch/status', {
          params: {
            from: fromValue,
            to: toValue,
          },
        }),
        api.get('/timesheets/hr/pending'),
        api.get('/timesheets/printable'),
      ]);
      setStatusData(statusResponse.data);
      setPendingApprovals(hrReviewResponse.data || []);
      setPrintableTimesheets(printableResponse.data || []);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load submission status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const initializePeriod = async () => {
      try {
        const saved = localStorage.getItem(filterStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.from && parsed?.to) {
            if (!active) {
              return;
            }
            setPeriodFrom(parsed.from);
            setPeriodTo(parsed.to);
            return;
          }
        }
      } catch {
        // Ignore malformed local storage values.
      }

      try {
        const latestResponse = await api.get('/timesheets/dispatch/latest-period');
        if (!active) {
          return;
        }
        setPeriodFrom(latestResponse.data.periodStart);
        setPeriodTo(latestResponse.data.periodEnd);
      } catch {
        if (!active) {
          return;
        }
        const today = toISODate(new Date());
        setPeriodFrom(today);
        setPeriodTo(today);
      }
    };

    initializePeriod();

    return () => {
      active = false;
    };
  }, [filterStorageKey]);

  useEffect(() => {
    if (!periodFrom || !periodTo) {
      return;
    }

    localStorage.setItem(filterStorageKey, JSON.stringify({ from: periodFrom, to: periodTo }));
    loadStatus(periodFrom, periodTo);
  }, [periodFrom, periodTo, loadStatus, filterStorageKey]);

  const sendOut = async () => {
    setSending(true);
    setFeedback('');

    try {
      const response = await api.post('/timesheets/dispatch/send-out', {
        periodFrom,
        periodTo,
      });
      const notificationInfo = response.data.notifications
        ? `, Emails Sent: ${response.data.notifications.sent}, Failed: ${response.data.notifications.failed}, Skipped: ${response.data.notifications.skipped}`
        : '';
      setFeedback(
        `${response.data.message} Created: ${response.data.createdCount}, Already Assigned: ${response.data.alreadyAssignedCount}${notificationInfo}`
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
            <h1 className="text-2xl font-semibold text-slate-800">HR Dispatch Panel</h1>
            <p className="text-sm text-slate-600">{user.name} ({user.email})</p>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">Role: hr</p>
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
          <p className="mt-1 text-sm text-slate-600">Period: {formatRange(statusData.periodStart, statusData.periodEnd)}</p>
        ) : null}

        {loading ? (
          <p className="mt-3 text-sm text-slate-700">Loading status...</p>
        ) : statusData?.statuses?.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">Manager</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Workflow Status</th>
                  <th className="px-3 py-2">Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {statusData.statuses.map((row) => (
                  <tr key={row.user.id} className="border-t border-slate-100 text-slate-700">
                    <td className="px-3 py-2">{row.user.name}</td>
                    <td className="px-3 py-2">{row.manager?.name || '-'}</td>
                    <td className="px-3 py-2">{row.assigned ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">{row.submitted ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">{STATUS_LABELS[row.status] || row.status || '-'}</td>
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Manager-Approved Queue</h2>
        <p className="mt-1 text-sm text-slate-600">These are waiting for HR Head review.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Manager</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">View</th>
              </tr>
            </thead>
            <tbody>
              {pendingApprovals.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-2">{item.user?.name || '-'}</td>
                  <td className="px-3 py-2">{item.manager?.name || '-'}</td>
                  <td className="px-3 py-2">{formatRange(item.periodStart, item.periodEnd)}</td>
                  <td className="px-3 py-2">{STATUS_LABELS[item.status] || item.status}</td>
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">HR Head Approved Timesheets (Printable)</h2>
        <p className="mt-1 text-sm text-slate-600">HR and Admin can print these approved reports.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Approved At</th>
                <th className="px-3 py-2">Total Hours</th>
                <th className="px-3 py-2">View</th>
                <th className="px-3 py-2">Print</th>
              </tr>
            </thead>
            <tbody>
              {printableTimesheets.map((item) => (
                <tr key={`hr-print-${item.id}`} className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-2">{item.user?.name || '-'}</td>
                  <td className="px-3 py-2">{formatRange(item.periodStart, item.periodEnd)}</td>
                  <td className="px-3 py-2">
                    {item.hrHeadReviewedAt ? dayjs(item.hrHeadReviewedAt).format('MMM D, YYYY h:mm A') : '-'}
                  </td>
                  <td className="px-3 py-2">{Number(item.totalHours || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setViewingTimesheet(item)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      View
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => printSubmittedTimesheet(item, setFeedback)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SubmittedTimesheetModal timesheet={viewingTimesheet} onClose={() => setViewingTimesheet(null)} />
    </>
  );
};

const ManagerPanel = ({ user }) => {
  const [queue, setQueue] = useState([]);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [reviewingId, setReviewingId] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadQueue = useCallback(async () => {
    try {
      const response = await api.get('/timesheets/manager/pending');
      setQueue(response.data || []);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load manager queue');
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const review = async (id, decision) => {
    const comment = window.prompt(`Optional note for ${decision}:`) || '';
    setReviewingId(id);
    setFeedback('');

    try {
      await api.post(`/timesheets/manager/review/${id}`, { decision, comment });
      setFeedback(`Timesheet ${decision}d successfully.`);
      await loadQueue();
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to review timesheet');
    } finally {
      setReviewingId('');
    }
  };

  return (
    <>
      <StaffPanel
        user={user}
        panelTitle="Manager Timesheet"
        roleLabel="manager"
        submitTargetLabel="CEO"
        loadErrorText="Unable to load manager timesheets"
      />

      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Manager Approval Panel</h1>
            <p className="text-sm text-slate-600">{user.name} ({user.email})</p>
          </div>
          <p className="rounded-lg bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">Role: manager</p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Pending Staff Approvals</h2>
        {feedback ? <p className="mt-2 text-sm text-slate-700">{feedback}</p> : null}

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Submitted At</th>
                <th className="px-3 py-2">Total Hours</th>
                <th className="px-3 py-2">View</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-2">{item.user?.name || '-'}</td>
                  <td className="px-3 py-2">{formatRange(item.periodStart, item.periodEnd)}</td>
                  <td className="px-3 py-2">
                    {item.submittedAt ? dayjs(item.submittedAt).format('MMM D, YYYY h:mm A') : '-'}
                  </td>
                  <td className="px-3 py-2">{Number(item.totalHours || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setViewingTimesheet(item)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      View
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => review(item.id, 'approve')}
                        disabled={reviewingId === item.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => review(item.id, 'reject')}
                        disabled={reviewingId === item.id}
                        className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SubmittedTimesheetModal timesheet={viewingTimesheet} onClose={() => setViewingTimesheet(null)} />
    </>
  );
};

const HRHeadPanel = ({ user }) => {
  const [queue, setQueue] = useState([]);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [reviewingId, setReviewingId] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadQueue = useCallback(async () => {
    try {
      const response = await api.get('/timesheets/hr-head/pending');
      setQueue(response.data || []);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load HR Head queue');
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const review = async (id, decision) => {
    const comment = window.prompt(`Optional note for ${decision}:`) || '';
    setReviewingId(id);
    setFeedback('');

    try {
      await api.post(`/timesheets/hr-head/review/${id}`, { decision, comment });
      setFeedback(`Timesheet ${decision}d by HR Head.`);
      await loadQueue();
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to review timesheet');
    } finally {
      setReviewingId('');
    }
  };

  return (
    <>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">HR Head Review Panel</h1>
            <p className="text-sm text-slate-600">{user.name} ({user.email})</p>
          </div>
          <p className="rounded-lg bg-fuchsia-50 px-3 py-1 text-sm font-medium text-fuchsia-700">Role: hr_head</p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Manager-Approved Timesheets</h2>
        <p className="mt-1 text-sm text-slate-600">Review and approve for payroll processing.</p>
        {feedback ? <p className="mt-2 text-sm text-slate-700">{feedback}</p> : null}

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Manager</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Manager Review</th>
                <th className="px-3 py-2">View</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-2">{item.user?.name || '-'}</td>
                  <td className="px-3 py-2">{item.manager?.name || '-'}</td>
                  <td className="px-3 py-2">{formatRange(item.periodStart, item.periodEnd)}</td>
                  <td className="px-3 py-2">
                    {item.managerReviewedAt ? dayjs(item.managerReviewedAt).format('MMM D, YYYY h:mm A') : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setViewingTimesheet(item)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      View
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => review(item.id, 'approve')}
                        disabled={reviewingId === item.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => review(item.id, 'reject')}
                        disabled={reviewingId === item.id}
                        className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SubmittedTimesheetModal timesheet={viewingTimesheet} onClose={() => setViewingTimesheet(null)} />
    </>
  );
};

const CeoPanel = ({ user }) => {
  const [queue, setQueue] = useState([]);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [reviewingId, setReviewingId] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadQueue = useCallback(async () => {
    try {
      const response = await api.get('/timesheets/ceo/pending');
      setQueue(response.data || []);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load CEO queue');
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const review = async (id, decision) => {
    const comment = window.prompt(`Optional note for ${decision}:`) || '';
    setReviewingId(id);
    setFeedback('');

    try {
      await api.post(`/timesheets/ceo/review/${id}`, { decision, comment });
      setFeedback(`Timesheet ${decision}d successfully.`);
      await loadQueue();
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to review timesheet');
    } finally {
      setReviewingId('');
    }
  };

  return (
    <>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">CEO Review Panel</h1>
            <p className="text-sm text-slate-600">{user.name} ({user.email})</p>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">Role: ceo</p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Pending Manager Timesheets</h2>
        {feedback ? <p className="mt-2 text-sm text-slate-700">{feedback}</p> : null}

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Manager</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Submitted At</th>
                <th className="px-3 py-2">Total Hours</th>
                <th className="px-3 py-2">View</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-2">{item.manager?.name || item.user?.name || '-'}</td>
                  <td className="px-3 py-2">{formatRange(item.periodStart, item.periodEnd)}</td>
                  <td className="px-3 py-2">
                    {item.submittedAt ? dayjs(item.submittedAt).format('MMM D, YYYY h:mm A') : '-'}
                  </td>
                  <td className="px-3 py-2">{Number(item.totalHours || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setViewingTimesheet(item)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      View
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => review(item.id, 'approve')}
                        disabled={reviewingId === item.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => review(item.id, 'reject')}
                        disabled={reviewingId === item.id}
                        className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SubmittedTimesheetModal timesheet={viewingTimesheet} onClose={() => setViewingTimesheet(null)} />
    </>
  );
};

const AdminPanel = ({ user }) => {
  const [submittedTimesheets, setSubmittedTimesheets] = useState([]);
  const [statusFrom, setStatusFrom] = useState(toISODate(new Date()));
  const [statusTo, setStatusTo] = useState(toISODate(new Date()));
  const [statusData, setStatusData] = useState(null);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  const loadAdminData = useCallback(async (fromValue, toValue) => {
    setLoading(true);
    setFeedback('');

    try {
      const [submittedResponse, statusResponse] = await Promise.all([
        api.get('/timesheets/printable'),
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
          <div className="flex items-center gap-2">
            <Link
              to="/settings/users"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700"
            >
              Settings: Create User
            </Link>
            <p className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">Role: admin</p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">HR Head Approved Timesheets (Printable)</h2>
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
                    <th className="px-3 py-2">Workflow Status</th>
                    <th className="px-3 py-2">Total Hours</th>
                    <th className="px-3 py-2">Submitted At</th>
                    <th className="px-3 py-2">View</th>
                    <th className="px-3 py-2">Print</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedTimesheets.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                      <td className="px-3 py-2">{item.user?.name || 'Unknown User'}</td>
                      <td className="px-3 py-2">{formatRange(item.periodStart, item.periodEnd)}</td>
                      <td className="px-3 py-2">{STATUS_LABELS[item.status] || item.status || '-'}</td>
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
                      <td className="px-3 py-2">
                        <button
                          onClick={() => printSubmittedTimesheet(item, setFeedback)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          Print
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
                <p className="mt-1 text-sm text-slate-600">Period: {formatRange(statusData.periodStart, statusData.periodEnd)}</p>
              ) : null}
              <table className="mt-2 min-w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Staff</th>
                    <th className="px-3 py-2">Manager</th>
                    <th className="px-3 py-2">Assigned</th>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2">Workflow Status</th>
                    <th className="px-3 py-2">Submitted At</th>
                  </tr>
                </thead>
                <tbody>
                  {(statusData?.statuses || []).map((row) => (
                    <tr key={`status-${row.user.id}`} className="border-t border-slate-100 text-slate-700">
                      <td className="px-3 py-2">{row.user.name}</td>
                      <td className="px-3 py-2">{row.manager?.name || '-'}</td>
                      <td className="px-3 py-2">{row.assigned ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">{row.submitted ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">{STATUS_LABELS[row.status] || row.status || '-'}</td>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <img src="/logo.png" alt="Company Logo" className="h-14 w-auto object-contain" />
          <button
            onClick={logout}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Logout
          </button>
        </div>

        {user?.role === 'admin' ? <AdminPanel user={user} /> : null}
        {user?.role === 'hr' ? <HRPanel user={user} /> : null}
        {user?.role === 'manager' ? <ManagerPanel user={user} /> : null}
        {user?.role === 'ceo' ? <CeoPanel user={user} /> : null}
        {user?.role === 'hr_head' ? <HRHeadPanel user={user} /> : null}
        {user?.role === 'staff' ? <StaffPanel user={user} /> : null}

        <footer className="rounded-xl border border-slate-200 bg-white/70 p-3 text-center text-xs text-slate-600">
          <strong>For any technical issues, contact: Dexter Dancel</strong>
          <strong>For HR related concern: Michelle Martin</strong>
        </footer>
      </div>
    </div>
  );
};

export default RoleDashboardPage;
