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
  'Custom Hours',
  'Half-day (Morning) w/o pay',
  'Half-day (Afternoon) w/o pay',
  'Sick Leave',
  'Vacation Leave',
  'Time-in-Lieu',
  'Discretionary Leave',
  'Non-discretionary Leave',
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

const ROLE_LABELS = {
  admin: 'Admin',
  hr: 'HR',
  manager: 'Manager',
  staff: 'Staff',
  ceo: 'CEO',
  hr_head: 'HR Head',
  payroll: 'Payroll',
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
  if (entryType === 'Custom Hours') {
    return 0;
  }
  if (entryType === 'Half-day (Morning) w/o pay') {
    return 4;
  }
  if (entryType === 'Half-day (Afternoon) w/o pay') {
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
  const html = buildPrintableTimesheetHtml([timesheet]);

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

const buildPrintableTimesheetSectionHtml = (timesheet) => {
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
  return `
    <section class="timesheet-page">
      <h1>Approved Timesheet</h1>
      <p class="meta">Staff: ${escapeHtml(timesheet.user?.name || 'Unknown')} (${escapeHtml(timesheet.user?.email || '-')})</p>
      <p class="meta">Period: ${escapeHtml(formatRange(timesheet.periodStart, timesheet.periodEnd))}</p>
      <p class="meta">Submitted: ${escapeHtml(submittedLabel)}</p>
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
    </section>
  `;
};

const buildPrintableTimesheetHtml = (timesheets = []) => {
  const sectionsHtml = timesheets.map((timesheet) => buildPrintableTimesheetSectionHtml(timesheet)).join('');

  return `<!doctype html>
    <html>
      <head>
        <title></title>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
          .timesheet-page { page-break-after: always; break-after: page; }
          .timesheet-page:last-child { page-break-after: auto; break-after: auto; }
          h1 { margin: 0 0 8px; }
          .meta { margin: 0 0 4px; font-size: 14px; color: #334155; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #f1f5f9; }
          .total { margin-top: 12px; font-weight: 700; }
        </style>
      </head>
      <body>
        ${sectionsHtml}
      </body>
    </html>
  `;
};

const printSubmittedTimesheets = (timesheets, onError) => {
  if (!Array.isArray(timesheets) || timesheets.length === 0) {
    onError?.('No approved timesheets found to print.');
    return;
  }

  const html = buildPrintableTimesheetHtml(timesheets);

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

      contentWindow.onafterprint = cleanup;

      setTimeout(() => {
        try {
          contentWindow.focus();
          contentWindow.print();
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
  const groupPayrollTimesheetsByPeriod = (timesheets = []) => {
    const grouped = new Map();

    timesheets.forEach((timesheet) => {
      const key = `${timesheet.periodStart}|${timesheet.periodEnd}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          periodStart: timesheet.periodStart,
          periodEnd: timesheet.periodEnd,
          items: [],
        });
      }

      grouped.get(key).items.push(timesheet);
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((left, right) => {
          const leftDate = left.submittedAt || left.hrHeadReviewedAt || left.periodStart;
          const rightDate = right.submittedAt || right.hrHeadReviewedAt || right.periodStart;
          return new Date(rightDate) - new Date(leftDate);
        }),
      }))
      .sort((left, right) => new Date(right.periodStart) - new Date(left.periodStart));
  };


const ApprovalBadge = ({ status }) => {
  return (
    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {STATUS_LABELS[status] || status || 'Draft'}
    </span>
  );
};

const ActiveRoleToolbar = ({ user }) => {
  const { setUser } = useAuth();
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(user?.role || '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const loadRoles = useCallback(async () => {
    try {
      const response = await api.get('/delegations/roles/available');
      const available = response.data?.roles || [];
      setRoles(available);
      setSelectedRole(response.data?.effectiveRole || user?.role || available[0] || '');
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load available roles');
    }
  }, [user?.role]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const onSwitchRole = async () => {
    if (!selectedRole) {
      return;
    }

    setSaving(true);
    setFeedback('');

    try {
      const response = await api.post('/delegations/roles/switch', { role: selectedRole });
      if (response.data?.user) {
        setUser(response.data.user);
      }
      setFeedback('Active role updated.');
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to switch role');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Current role: {ROLE_LABELS[user.role] || user.role}</h2>
          <p className="text-xs text-slate-600">Switch to any delegated role assigned by admin.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role] || role}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onSwitchRole}
            disabled={saving || !selectedRole}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Switch Role'}
          </button>
        </div>
      </div>
      {feedback ? <p className="mt-2 text-xs text-slate-600">{feedback}</p> : null}
    </section>
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
  const [leaveBalances, setLeaveBalances] = useState(null);

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
      const [recentResponse, leaveResponse] = await Promise.all([
        api.get('/timesheets/recent'),
        api.get('/leaves/me'),
      ]);
      const allTimesheets = recentResponse.data;
      const drafts = allTimesheets.filter(
        (item) =>
          !item.submittedAt || ['manager_rejected', 'ceo_rejected', 'hr_head_rejected'].includes(item.status)
      );
      const submitted = allTimesheets.filter((item) => Boolean(item.submittedAt));
      setLeaveBalances(leaveResponse.data?.balances || null);

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
        if (field === 'dateOnly') {
          nextEntry.date = value;
        }
        if (field === 'entryType') {
          if (value === 'Overtime') {
            nextEntry.hours = normalizeHours(nextEntry.hours, 0);
            nextEntry.overtimeHours = normalizeHours(nextEntry.overtimeHours, 0);
          } else if (value === 'Custom Hours') {
            nextEntry.hours = normalizeHours(nextEntry.hours, 0);
            nextEntry.overtimeHours = 0;
          } else {
            nextEntry.hours = getDefaultHours(value);
            nextEntry.overtimeHours = 0;
          }
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

  const addCustomEntry = () => {
    setTimesheet((previous) => {
      if (!previous) {
        return previous;
      }

      const fallbackDate = toISODate(previous.periodStart || new Date());
      const newEntry = {
        id: `custom-${Date.now()}`,
        date: fallbackDate,
        dateOnly: fallbackDate,
        entryType: 'Custom Hours',
        notes: '',
        hours: 0,
        overtimeHours: 0,
        isCustomEntry: true,
      };

      const nextEntries = [...previous.entries, newEntry];
      return {
        ...previous,
        entries: nextEntries,
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

        {leaveBalances ? (
          <div className="mt-4 grid gap-2 text-xs text-slate-700 md:grid-cols-5">
            <p className="rounded-lg bg-slate-100 px-2 py-1">Annual: {Number(leaveBalances.annualLeave || 0)}</p>
            <p className="rounded-lg bg-slate-100 px-2 py-1">Sick: {Number(leaveBalances.sickLeave || 0)}</p>
            <p className="rounded-lg bg-slate-100 px-2 py-1">Time-in-Lieu: {Number(leaveBalances.timeInLieu || 0)}</p>
            <p className="rounded-lg bg-slate-100 px-2 py-1">Discretionary: {Number(leaveBalances.discretionaryLeave || 0)}</p>
            <p className="rounded-lg bg-slate-100 px-2 py-1">Non-discretionary: {Number(leaveBalances.nonDiscretionaryLeave || 0)}</p>
          </div>
        ) : null}
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

          <TimesheetTable
            entries={timesheet.entries}
            typeOptions={TYPE_OPTIONS}
            onEntryChange={onEntryChange}
            onAddCustomEntry={addCustomEntry}
          />

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
                  <tr key={row.user.id} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
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
                <tr key={item.id} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
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
                <tr key={`hr-print-${item.id}`} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
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
                <tr key={item.id} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
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
                <tr key={item.id} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
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
                <tr key={item.id} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
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
  const [users, setUsers] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [submittedTimesheets, setSubmittedTimesheets] = useState([]);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resettingUserId, setResettingUserId] = useState('');
  const [delegating, setDelegating] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [openPeriodKey, setOpenPeriodKey] = useState('');
  const [delegationForm, setDelegationForm] = useState({
    staffId: '',
    delegatedRole: 'manager',
    reason: '',
    endDate: '',
  });

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setFeedback('');

    try {
      const [usersResponse, submittedResponse] = await Promise.all([
        api.get('/auth/admin/users'),
        api.get('/timesheets/printable'),
      ]);
      setUsers(usersResponse.data || []);
      setSubmittedTimesheets(submittedResponse.data || []);
      const delegationResponse = await api.get('/delegations?status=active');
      setDelegations(delegationResponse.data || []);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const groupedTimesheets = useMemo(() => groupPayrollTimesheetsByPeriod(submittedTimesheets), [submittedTimesheets]);

  useEffect(() => {
    if (!groupedTimesheets.length) {
      setOpenPeriodKey('');
      return;
    }

    setOpenPeriodKey((currentKey) => currentKey || groupedTimesheets[0].key);
  }, [groupedTimesheets]);

  const handleResetRequest = async (targetUser) => {
    const confirmed = window.confirm(`Send password reset email to ${targetUser.name}?`);
    if (!confirmed) {
      return;
    }

    setResettingUserId(targetUser.id);
    setFeedback('');

    try {
      const response = await api.post('/auth/admin/request-password-reset', { userId: targetUser.id });
      setFeedback(response.data?.message || 'Password reset email sent successfully.');
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to send password reset email.');
    } finally {
      setResettingUserId('');
    }
  };

  const staffUsers = useMemo(
    () => users.filter((record) => record.primaryRole === 'staff' || record.role === 'staff'),
    [users]
  );

  const handleCreateDelegation = async (event) => {
    event.preventDefault();
    if (!delegationForm.staffId || !delegationForm.delegatedRole) {
      setFeedback('Staff and delegated role are required.');
      return;
    }

    setDelegating(true);
    setFeedback('');

    try {
      await api.post('/delegations', {
        staffId: delegationForm.staffId,
        delegatedRole: delegationForm.delegatedRole,
        reason: delegationForm.reason,
        endDate: delegationForm.endDate || undefined,
      });

      setFeedback('Delegation assigned successfully.');
      setDelegationForm({ staffId: '', delegatedRole: 'manager', reason: '', endDate: '' });

      const delegationResponse = await api.get('/delegations?status=active');
      setDelegations(delegationResponse.data || []);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to create delegation.');
    } finally {
      setDelegating(false);
    }
  };

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
        <h2 className="text-lg font-semibold text-slate-800">User Records</h2>
        <p className="mt-1 text-sm text-slate-600">View all accounts and trigger password reset emails when requested.</p>

        {feedback ? <p className="mt-3 text-sm text-slate-700">{feedback}</p> : null}

        {loading ? (
          <p className="mt-3 text-sm text-slate-700">Loading admin data...</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Supervisor</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((record) => (
                  <tr key={record.id} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
                    <td className="px-3 py-2">{record.name}</td>
                    <td className="px-3 py-2">{record.email}</td>
                    <td className="px-3 py-2">{record.role}</td>
                    <td className="px-3 py-2">{record.manager?.name || '-'}</td>
                    <td className="px-3 py-2">{record.createdAt ? dayjs(record.createdAt).format('MMM D, YYYY') : '-'}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleResetRequest(record)}
                        disabled={resettingUserId === record.id}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                      >
                        {resettingUserId === record.id ? 'Sending...' : 'Send Reset Email'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Approved Timesheets for Payroll</h2>
        <p className="mt-1 text-sm text-slate-600">
          Same grouped payroll view: latest pay period opens by default, with per-period print-all.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading timesheets...</p>
        ) : groupedTimesheets.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No HR-approved timesheets available for payroll processing.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {groupedTimesheets.map((group) => {
              const isOpen = openPeriodKey === group.key;

              return (
                <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setOpenPeriodKey(isOpen ? '' : group.key)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div>
                      <h3 className="text-base font-semibold text-slate-800">
                        {formatRange(group.periodStart, group.periodEnd)}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {group.items.length} approved timesheet{group.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                      {isOpen ? 'Collapse' : 'Expand'}
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="border-t border-slate-200 bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-600">
                          Print or review the approved staff sheets for this pay period.
                        </p>
                        <button
                          type="button"
                          onClick={() => printSubmittedTimesheets(group.items, (error) => setFeedback(error))}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          Print All in Period
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                            <tr>
                              <th className="px-3 py-2">Staff</th>
                              <th className="px-3 py-2">Manager</th>
                              <th className="px-3 py-2">Total Hours</th>
                              <th className="px-3 py-2">Submitted At</th>
                              <th className="px-3 py-2">HR Approved At</th>
                              <th className="px-3 py-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item) => (
                              <tr key={item.id} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
                                <td className="px-3 py-2">{item.user?.name || '-'}</td>
                                <td className="px-3 py-2">{item.manager?.name || '-'}</td>
                                <td className="px-3 py-2">{Number(item.totalHours || 0).toFixed(2)}</td>
                                <td className="px-3 py-2">
                                  {item.submittedAt ? dayjs(item.submittedAt).format('MMM D, YYYY') : '-'}
                                </td>
                                <td className="px-3 py-2">
                                  {item.hrHeadReviewedAt ? dayjs(item.hrHeadReviewedAt).format('MMM D, YYYY') : '-'}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setViewingTimesheet(item)}
                                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => printSubmittedTimesheet(item, (error) => setFeedback(error))}
                                      className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                    >
                                      Print
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Role Delegation</h2>
        <p className="mt-1 text-sm text-slate-600">Assign temporary extra roles to staff accounts.</p>

        <form onSubmit={handleCreateDelegation} className="mt-4 grid gap-3 md:grid-cols-4">
          <select
            value={delegationForm.staffId}
            onChange={(event) =>
              setDelegationForm((previous) => ({ ...previous, staffId: event.target.value }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select Staff</option>
            {staffUsers.map((record) => (
              <option key={record.id} value={record.id}>
                {record.name} ({record.email})
              </option>
            ))}
          </select>

          <select
            value={delegationForm.delegatedRole}
            onChange={(event) =>
              setDelegationForm((previous) => ({ ...previous, delegatedRole: event.target.value }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="manager">Manager</option>
            <option value="hr">HR</option>
            <option value="ceo">CEO</option>
            <option value="hr_head">HR Head</option>
            <option value="payroll">Payroll</option>
          </select>

          <input
            type="date"
            value={delegationForm.endDate}
            onChange={(event) =>
              setDelegationForm((previous) => ({ ...previous, endDate: event.target.value }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <button
            type="submit"
            disabled={delegating}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {delegating ? 'Assigning...' : 'Assign Delegation'}
          </button>

          <input
            type="text"
            value={delegationForm.reason}
            onChange={(event) =>
              setDelegationForm((previous) => ({ ...previous, reason: event.target.value }))
            }
            placeholder="Reason (optional)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-4"
          />
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Delegated Role</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {delegations.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-2">{item.staff?.name || '-'}</td>
                  <td className="px-3 py-2">{ROLE_LABELS[item.delegatedRole] || item.delegatedRole}</td>
                  <td className="px-3 py-2">{item.startDate ? dayjs(item.startDate).format('MMM D, YYYY') : '-'}</td>
                  <td className="px-3 py-2">{item.endDate ? dayjs(item.endDate).format('MMM D, YYYY') : 'Open'}</td>
                  <td className="px-3 py-2">{item.status}</td>
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

const PayrollPanel = ({ user }) => {
  const [submittedTimesheets, setSubmittedTimesheets] = useState([]);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [openPeriodKey, setOpenPeriodKey] = useState('');

  const loadPayrollData = useCallback(async () => {
    setLoading(true);
    setFeedback('');

    try {
      const response = await api.get('/timesheets/printable');
      setSubmittedTimesheets(response.data || []);
    } catch (error) {
      setFeedback(error.response?.data?.message || 'Unable to load payroll timesheets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayrollData();
  }, [loadPayrollData]);

  const groupedTimesheets = useMemo(() => groupPayrollTimesheetsByPeriod(submittedTimesheets), [submittedTimesheets]);

  useEffect(() => {
    if (!groupedTimesheets.length) {
      setOpenPeriodKey('');
      return;
    }

    setOpenPeriodKey((currentKey) => currentKey || groupedTimesheets[0].key);
  }, [groupedTimesheets]);

  const handlePrint = (timesheet, onError) => {
    printSubmittedTimesheet(timesheet, onError);
  };

  const handlePrintAllForPeriod = (timesheets, onError) => {
    printSubmittedTimesheets(timesheets, onError);
  };

  return (
    <>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Payroll Dashboard</h1>
            <p className="text-sm text-slate-600">{user.name} ({user.email})</p>
          </div>
          <p className="rounded-lg bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-700">Role: payroll</p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Approved Timesheets for Payroll</h2>
        <p className="mt-1 text-sm text-slate-600">
          View approved pay periods in separate groups. The latest pay period opens by default.
        </p>
        {feedback ? <p className="mt-2 text-sm text-red-600">{feedback}</p> : null}

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading timesheets...</p>
        ) : groupedTimesheets.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No HR-approved timesheets available for payroll processing.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {groupedTimesheets.map((group) => {
              const isOpen = openPeriodKey === group.key;

              return (
                <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setOpenPeriodKey(isOpen ? '' : group.key)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div>
                      <h3 className="text-base font-semibold text-slate-800">
                        {formatRange(group.periodStart, group.periodEnd)}
                      </h3>
                      <p className="text-sm text-slate-600">{group.items.length} approved timesheet{group.items.length === 1 ? '' : 's'}</p>
                    </div>
                    <span className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                      {isOpen ? 'Collapse' : 'Expand'}
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="border-t border-slate-200 bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-600">
                          Print or review the approved staff sheets for this pay period.
                        </p>
                        <button
                          type="button"
                          onClick={() => handlePrintAllForPeriod(group.items, (error) => setFeedback(error))}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          Print All in Period
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                            <tr>
                              <th className="px-3 py-2">Staff</th>
                              <th className="px-3 py-2">Manager</th>
                              <th className="px-3 py-2">Total Hours</th>
                              <th className="px-3 py-2">Submitted At</th>
                              <th className="px-3 py-2">HR Approved At</th>
                              <th className="px-3 py-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item) => (
                              <tr key={item.id} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
                                <td className="px-3 py-2">{item.user?.name || '-'}</td>
                                <td className="px-3 py-2">{item.manager?.name || '-'}</td>
                                <td className="px-3 py-2">{Number(item.totalHours || 0).toFixed(2)}</td>
                                <td className="px-3 py-2">
                                  {item.submittedAt ? dayjs(item.submittedAt).format('MMM D, YYYY') : '-'}
                                </td>
                                <td className="px-3 py-2">
                                  {item.hrHeadReviewedAt ? dayjs(item.hrHeadReviewedAt).format('MMM D, YYYY') : '-'}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setViewingTimesheet(item)}
                                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handlePrint(item, (error) => setFeedback(error))}
                                      className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                    >
                                      Print
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <SubmittedTimesheetModal timesheet={viewingTimesheet} onClose={() => setViewingTimesheet(null)} />
    </>
  );
};

const RoleDashboardPage = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-100 via-emerald-50 to-white px-4 pb-28 pt-6">
      <div className="mx-auto flex max-w-6xl flex-col space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <img src="/logo.png" alt="Company Logo" className="h-14 w-auto object-contain" />
          <button
            onClick={logout}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Logout
          </button>
        </div>

        <ActiveRoleToolbar user={user} />

        {user?.role === 'admin' ? <AdminPanel user={user} /> : null}
        {user?.role === 'hr' ? <HRPanel user={user} /> : null}
        {user?.role === 'manager' ? <ManagerPanel user={user} /> : null}
        {user?.role === 'ceo' ? <CeoPanel user={user} /> : null}
        {user?.role === 'hr_head' ? <HRHeadPanel user={user} /> : null}
        {user?.role === 'payroll' ? <PayrollPanel user={user} /> : null}
        {user?.role === 'staff' ? <StaffPanel user={user} /> : null}

        <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 text-xs text-slate-600 backdrop-blur">
          <div className="mx-auto w-full max-w-6xl text-center">
            <p>For any technical issues, contact: Dexter Dancel</p>
            <p>For HR related concern: Michelle Martin</p>
            <p>DEVELOPED BY: MTIE - IT</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default RoleDashboardPage;
