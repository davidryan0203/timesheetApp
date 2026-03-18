import dayjs from 'dayjs';

const TimesheetTable = ({ entries, typeOptions, onEntryChange }) => {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-3">Date</th>
            <th className="px-3 py-3">Day</th>
            <th className="px-3 py-3">Type</th>
            <th className="px-3 py-3">Work Hours</th>
            <th className="px-3 py-3">Overtime Extra</th>
            <th className="px-3 py-3">Total</th>
            <th className="px-3 py-3">Notes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.dateOnly || entry.date} className="border-t border-slate-100 text-slate-700">
              <td className="whitespace-nowrap px-3 py-2">{dayjs(entry.dateOnly || entry.date).format('MMM D, YYYY')}</td>
              <td className="whitespace-nowrap px-3 py-2">{dayjs(entry.dateOnly || entry.date).format('ddd')}</td>
              <td className="px-3 py-2">
                <select
                  value={entry.entryType || 'Regular Hours'}
                  onChange={(event) => onEntryChange(index, 'entryType', event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1"
                >
                  {typeOptions.map((typeOption) => (
                    <option key={typeOption} value={typeOption}>
                      {typeOption}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={entry.hours ?? 0}
                  onChange={(event) => onEntryChange(index, 'hours', event.target.value)}
                  className="w-28 rounded-lg border border-slate-300 px-2 py-1"
                />
              </td>
              <td className="px-3 py-2">
                {entry.entryType === 'Overtime' ? (
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={entry.overtimeHours ?? 0}
                    onChange={(event) => onEntryChange(index, 'overtimeHours', event.target.value)}
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1"
                  />
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </td>
              <td className="px-3 py-2 font-medium">
                {Number((entry.hours || 0) + (entry.overtimeHours || 0)).toFixed(2)}
              </td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  value={entry.notes || ''}
                  onChange={(event) => onEntryChange(index, 'notes', event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1"
                  placeholder="Optional"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TimesheetTable;
