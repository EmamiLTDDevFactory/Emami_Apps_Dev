export default function BackButton({ onClick, label = 'Back to Dashboard' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="btn-primary">
      {label}
    </button>
  );
}
