// One CSV export control, reused by the inspector, compare mode, and the
// radius selection. It only ever writes the facts to rows. Any weighting or
// scoring the analyst wants happens downstream in their own spreadsheet,
// never in this tool.

import { Button } from "@mui/material";
import { Download as DownloadIcon } from "@carbon/icons-react";
import { toCsv, downloadCsv, stamp } from "../data/csv";

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
      size="small"
      variant="outlined"
      startIcon={<DownloadIcon size={16} />}
      onClick={onClick}
      aria-label={label}
      sx={{ textTransform: "none", fontWeight: 600 }}
    >
      {label}
    </Button>
  );
}
