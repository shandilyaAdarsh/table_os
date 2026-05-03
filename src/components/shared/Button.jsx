export default function Button({ label, onClick, variant = 'primary', disabled = false, fullWidth = false }) {
  const base = 'font-semibold text-sm px-4 py-2 rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary:   'bg-accent-500 text-white hover:bg-amber-600 active:scale-95',
    secondary: 'bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-95',
    danger:    'bg-danger-500 text-white hover:bg-red-600 active:scale-95',
    ghost:     'bg-transparent text-gray-600 hover:bg-gray-100 active:scale-95',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant] || variants.primary} ${fullWidth ? 'w-full' : ''}`}
    >
      {label}
    </button>
  );
}
