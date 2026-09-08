// CSV export. The analyst does their weighting, scoring, and memo prep
// downstream in their own spreadsheet. Giving them a clean export means that
// downstream work is based on this tool's data, not hand re-entry. The tool
// itself never scores or ranks; the CSV is just the facts, laid out in rows.

// RFC-4180-ish quoting: wrap in quotes when the value contains a comma, quote,
// or newline; double any embedded quotes.
function cell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  return lines.join("\r\n") + "\r\n";
}

// Trigger a browser download of a CSV string. The user asked for the export, so
// this is a user-initiated save, not an automatic one.
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// A stable, readable timestamp for filenames.
export function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
