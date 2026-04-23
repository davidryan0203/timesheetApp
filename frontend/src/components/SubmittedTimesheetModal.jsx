import dayjs from 'dayjs';
import { formatDateLabel, formatDayLabel, formatRange } from '../utils/date';

const STATUS_LABELS = {
  draft: 'Draft',
  pending_manager: 'Pending Manager',
  manager_approved: 'Approved by Manager',
  manager_rejected: 'Rejected by Manager',
  pending_ceo: 'Pending CEO',
  ceo_approved: 'Approved by CEO',
  ceo_rejected: 'Rejected by CEO',
  hr_head_approved: 'Approved by HR Head',
  hr_head_rejected: 'Rejected by HR Head',
};

const SubmittedTimesheetModal = ({ timesheet, onClose }) => {
  if (!timesheet) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-800">Submitted Timesheet</h3>
            <p className="text-sm text-slate-600">
              Period: {formatRange(timesheet.periodStart, timesheet.periodEnd)}
            </p>
            {timesheet.user ? (
              <p className="text-sm text-slate-600">
                Staff: {timesheet.user.name} ({timesheet.user.email})
              </p>
            ) : null}
            <p className="text-sm text-slate-600">
              Submitted: {timesheet.submittedAt ? dayjs(timesheet.submittedAt).format('MMM D, YYYY h:mm A') : 'Draft'}
            </p>
            <p className="text-sm text-slate-600">
              Status: {STATUS_LABELS[timesheet.status] || timesheet.status || 'Draft'}
            </p>
            {timesheet.managerComment ? (
              <p className="text-sm text-slate-600">Manager Note: {timesheet.managerComment}</p>
            ) : null}
            {timesheet.hrHeadComment ? (
              <p className="text-sm text-slate-600">HR Head Note: {timesheet.hrHeadComment}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Work Hours</th>
                <th className="px-3 py-2">Overtime Extra</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {timesheet.entries.map((entry) => (
                <tr key={entry.dateOnly || entry.date} className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900">
                  <td className="whitespace-nowrap px-3 py-2">{formatDateLabel(entry.dateOnly || entry.date)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDayLabel(entry.dateOnly || entry.date)}</td>
                  <td className="px-3 py-2">{entry.entryType || 'Regular Hours'}</td>
                  <td className="px-3 py-2">{Number(entry.hours || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{Number(entry.overtimeHours || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    {Number((entry.hours || 0) + (entry.overtimeHours || 0)).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">{entry.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-right text-sm font-semibold text-emerald-700">
          Total Hours: {Number(timesheet.totalHours || 0).toFixed(2)}
        </p>
      </div>
    </div>
  );
};

export default SubmittedTimesheetModal;
