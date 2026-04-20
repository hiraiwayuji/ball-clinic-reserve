"use client";
import UniversalImportDialog from "./UniversalImportDialog";
type Props = { open: boolean; onClose: () => void; onDone: () => void };
export default function ExpensesImportDialog({ open, onClose, onDone }: Props) {
  return (
    <UniversalImportDialog
      open={open} onClose={onClose} onDone={onDone}
      targetSchema="expenses" title="経費インポート"
    />
  );
}
