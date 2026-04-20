"use client";
import UniversalImportDialog from "./UniversalImportDialog";
type Props = { open: boolean; onClose: () => void; onDone: () => void };
export default function InsuranceImportDialog({ open, onClose, onDone }: Props) {
  return (
    <UniversalImportDialog
      open={open} onClose={onClose} onDone={onDone}
      targetSchema="insurance" title="保険入金インポート"
    />
  );
}
