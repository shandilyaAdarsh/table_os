export function CategoryBubbles({ activeCategory, onSelectCategory, categories, size = 'full' }) {
  const isCompact = size === 'compact'

  return (
    <div
      className="scrollbar-hide"
      style={{ 
        display: 'flex', 
        gap: isCompact ? 8 : 10, 
        overflowX: 'auto', 
        WebkitOverflowScrolling: 'touch', 
        scrollbarWidth: 'none', 
        msOverflowStyle: 'none', 
        padding: isCompact ? '0 16px' : '0 16px 4px' 
      }}
    >
      {categories.map(cat => {
        const active = activeCategory === cat.id
        return (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            style={{
              flexShrink: 0,
              padding: isCompact ? '6px 14px' : '8px 20px',
              minHeight: 44,
              minWidth: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 9999,
              border: '1.5px solid',
              borderColor: active ? '#E31E24' : '#E5E7EB',
              cursor: 'pointer',
              fontSize: isCompact ? 11 : 12,
              fontWeight: 700,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              backgroundColor: active ? '#E31E24' : '#FFFFFF',
              color: active ? '#FFFFFF' : '#4B5563',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            {cat.name}
          </button>
        )
      })}
    </div>
  )
}
