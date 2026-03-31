export default function Badge({ label, color = 'gray' }) {
  const colors = {
    green:  'bg-success-100 text-success-500',
    amber:  'bg-warning-100 text-warning-500',
    red:    'bg-danger-100  text-danger-500',
    blue:   'bg-blue-100    text-blue-600',
    gray:   'bg-gray-100    text-gray-600',
    brand:  'bg-brand-900   text-white',
  };
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${colors[color] || colors.gray}`}>
      {label}
    </span>
  );
}
