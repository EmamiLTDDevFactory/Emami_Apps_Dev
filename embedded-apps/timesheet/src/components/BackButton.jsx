import { useTheme } from '../context/ThemeContext'

export default function BackButton({ onClick, label = 'Back to Dashboard' }) {
  const { isMinimal } = useTheme()
  const colorClasses = isMinimal
    ? 'border-indigo-600 bg-indigo-600 hover:bg-indigo-700 hover:border-indigo-700 focus-visible:ring-indigo-500'
    : 'border-blue-600 bg-blue-600 hover:bg-blue-700 hover:border-blue-700 focus-visible:ring-blue-500'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 ${colorClasses}`}
    >
      {label}
    </button>
  )
}
