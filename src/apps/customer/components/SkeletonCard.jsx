const shimmer = `
  @keyframes shimmer {
    0% { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
`;

export function SkeletonCard() {
  return (
    <>
      <style>{shimmer}</style>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '12px',
        padding: '14px',
        borderRadius: '16px',
        background: '#FFFFFF',
        border: '1px solid #EDEEEF',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        animation: 'shimmer 1.4s ease-in-out infinite',
        backgroundImage: 'linear-gradient(90deg, #FFFFFF 25%, #F3F4F6 50%, #FFFFFF 75%)',
        backgroundSize: '800px 100%',
      }}>
        {/* Info placeholder */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ height: '16px', borderRadius: '4px', background: 'rgba(0,0,0,0.06)', width: '80%' }} />
          <div style={{ height: '10px', borderRadius: '4px', background: 'rgba(0,0,0,0.04)', width: '100%' }} />
          <div style={{ height: '10px', borderRadius: '4px', background: 'rgba(0,0,0,0.04)', width: '60%' }} />
          <div style={{ height: '14px', borderRadius: '4px', background: 'rgba(249,115,22,0.1)', width: '30%', marginTop: '4px' }} />
        </div>
        {/* Thumbnail placeholder */}
        <div style={{ width: '90px', height: '90px', borderRadius: '12px', background: 'rgba(0,0,0,0.04)', flexShrink: 0 }} />
      </div>
    </>
  );
}
