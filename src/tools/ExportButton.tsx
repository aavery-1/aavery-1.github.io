// One CSV export control, reused by the inspector, compare mode, and the
// radius selection. It only ever writes the facts to rows. Any weighting or
// scoring the analyst wants happens downstream in their own spreadsheet,
// never in this tool.

import { Button, IconButton } from "@carbon/react";
import { Download as DownloadIcon } from "@carbon/icons-react";
import { toCsv, downloadCsv, stamp } from "../data/csv";
import "./ExportButton.carbon.css";

export function ExportButton({
  filenameBase,
  headers,
  rows,
  label = "Export CSV",
  iconOnly = false,
}: {
  filenameBase: string;
  headers: string[];
  rows: Array<Array<unknown>>;
  label?: string;
  // Icon-only variant for tight rows (e.g. the shortlist tray on a phone). The
  // label survives as the tooltip / accessible name.
  iconOnly?: boolean;
}) {
  const onClick = () => {
    const csv = toCsv(headers, rows);
    downloadCsv(`${filenameBase}_${stamp()}.csv`, csv);
  };
  if (iconOnly) {
    return (
      <IconButton className="export-button" size="sm" kind="ghost" label={label} align="bottom-right" onClick={onClick}>
        <DownloadIcon size={16} />
      </IconButton>
    );
  }
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
