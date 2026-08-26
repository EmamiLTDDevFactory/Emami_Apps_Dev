import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";

export default function AuditTable({
  audits,
}) {
  return (
    <Paper sx={{ marginTop: 4 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>
              Audit Number
            </TableCell>

            <TableCell>
              Depot
            </TableCell>

            <TableCell>
              Auditor
            </TableCell>

            <TableCell>
              Type
            </TableCell>

            <TableCell>
              Status
            </TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {audits.map((audit) => (
            <TableRow key={audit.id}>
              <TableCell>
                {/* {audit.id} */}
                {audit.auditNo}
              </TableCell>

              <TableCell>
                {audit.depot}
              </TableCell>

              <TableCell>
                {audit.auditor}
              </TableCell>

              <TableCell>
                {audit.auditType}
              </TableCell>

              <TableCell>
                {audit.status}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
