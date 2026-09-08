// One CSV export control, reused by the inspector, compare mode, and the
// radius selection. It only ever writes the facts to rows. Any weighting or
// scoring the analyst wants happens downstream in their own spreadsheet,
// never in this tool.

import { Button } from "@carbon/react";
import { Download as DownloadIcon } from "@carbon/icons-react";
import { toCsv, downloadCsv, stamp } from "../data/csv";
import "./ExportButton.carbon.css";

export function ExportButton({
  filenameBase,
  headers,
  rows,
  label = "Export CSV",
}: {
  filenameBase: string;
  headers: string[];
  rows: Array<Array<unknown>>;
  label?: string;
}) {
  const onClick = () => {
    const csv = toCsv(headers, rows);
    downloadCsv(`${filenameBase}_${stamp()}.csv`, csv);
  };
  return (
    <Button
      className="export-button"
      size="sm"
      kind="secondary"
      renderIcon={DownloadIcon}
      onClick={onClick}
      aria-label={label}
    >
      {label}
    </Button>
  );
}
