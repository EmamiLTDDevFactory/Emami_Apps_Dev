export default function BackButton({ onClick, label = 'Back to Dashboard' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 hover:border-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {label}
    </button>
  )
}
