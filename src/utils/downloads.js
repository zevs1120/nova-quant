export function downloadCsv(filename, rows) {
  const header = [
    'time_in',
    'time_out',
    'market',
    'symbol',
    'side',
    'entry',
    'exit',
    'pnl_pct',
    'fees',
    'signal_id',
  ];
  const csv = [
    header.join(','),
    ...rows.map((row) =>
      header
        .map((key) => {
          const raw = row[key] ?? '';
          const value = String(raw).replace(/"/g, '""');
          return `"${value}"`;
        })
        .join(','),
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
