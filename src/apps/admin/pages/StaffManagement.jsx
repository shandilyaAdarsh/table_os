import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase.js';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

// We map generic colors to the available tailwind semantic equivalents where possible, 
// or use fallback colors that fit the theme
const ROLE_STYLES = {
  owner: 'bg-primary-container text-on-primary-container border-primary-container/30',
  manager: 'bg-tertiary-container text-on-tertiary-container border-tertiary-container/30',
  waiter: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30',
  kitchen: 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30',
};

const PinCell = ({ pin }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-on-surface-variant w-12 tracking-widest tabular-nums">
        {show ? pin : '••••'}
      </span>
      <button onClick={() => setShow(!show)} className="text-on-surface-variant hover:text-on-surface transition-colors bg-surface-container-low hover:bg-surface-container-highest p-1.5 rounded-full">
        <span className="material-symbols-outlined text-[16px]">{show ? 'visibility_off' : 'visibility'}</span>
      </button>
    </div>
  );
};

export default function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Modal form state
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('waiter');
  const [formPin, setFormPin] = useState('');

  const fetchStaff = async () => {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .order('name', { ascending: true });

    if (data) setStaff(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleToggleActive = async (id, currentStatus) => {
    const { error } = await supabase
      .from('staff')
      .update({ is_active: !currentStatus })
      .eq('id', id);
    if (!error) {
      setStaff(s => s.map(member => member.id === id ? { ...member, is_active: !currentStatus } : member));
    }
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    if (!formName || !formPin || formPin.length !== 4) return;
    
    const { data, error } = await supabase
      .from('staff')
      .insert({
        name: formName,
        role: formRole,
        pin: formPin,
        tenant_id: TENANT_ID,
        is_active: true
      })
      .select();

    if (!error && data) {
      setStaff([...staff, data[0]]);
      setShowModal(false);
      setFormName('');
      setFormRole('waiter');
      setFormPin('');
    }
  };

  return (
    <div className="flex flex-col min-h-screen text-on-surface font-body pb-[calc(84px+env(safe-area-inset-bottom))]">
      <main className="max-w-[390px] md:max-w-7xl mx-auto w-full px-4 pt-6 space-y-6 flex flex-col h-full">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-surface-container-low pb-6 shrink-0">
          <div>
            <h1 className="text-2xl font-black text-on-surface font-mono tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[28px]">group</span>
              Staff Management
            </h1>
            <p className="text-on-surface-variant text-sm mt-1">Manage team access and POS logic roles.</p>
          </div>
          
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-linear-to-br from-primary to-primary-container hover:opacity-90 text-white font-bold text-sm px-5 py-2.5 rounded-full transition-colors shadow-[0_4px_12px_rgba(214,158,46,0.2)] active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">add</span> Add Staff
          </button>
        </div>

        {/* TABLE */}
        <div className="flex-1 overflow-auto bg-surface-container-lowest shadow-[0_12px_32px_-8px_rgba(20,27,43,0.08)] rounded-4xl flex flex-col relative min-h-[400px]">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 py-4 px-6 border-b border-surface-container-low bg-surface-bright sticky top-0 z-10 shrink-0 rounded-t-4xl">
            <div className="col-span-4 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-mono">Name</div>
            <div className="col-span-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-mono">Role</div>
            <div className="col-span-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-mono">PIN</div>
            <div className="col-span-2 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-mono text-right">Status</div>
          </div>

          {/* List Body */}
          <div className="flex-1 overflow-y-auto pb-4">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : staff.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-center">
                <span className="material-symbols-outlined text-[48px] text-surface-container-high mb-4">group</span>
                <p className="text-on-surface-variant font-mono text-sm">No staff members found.</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-container-low">
                {staff.map(member => (
                  <div key={member.id} className={`grid grid-cols-12 gap-4 py-5 px-6 items-center hover:bg-surface-bright transition-colors ${!member.is_active ? 'opacity-50 grayscale' : ''}`}>
                    <div className="col-span-4 font-bold text-on-surface text-base truncate">
                      {member.name}
                    </div>
                    <div className="col-span-3">
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${ROLE_STYLES[member.role] || ROLE_STYLES.waiter}`}>
                        {member.role}
                      </span>
                    </div>
                    <div className="col-span-3">
                      <PinCell pin={member.pin} />
                    </div>
                    <div className="col-span-2 flex justify-end items-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={member.is_active}
                          onChange={() => handleToggleActive(member.id, member.is_active)}
                          disabled={member.role === 'owner'}
                        />
                        <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:shadow-sm after:border-transparent after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981] disabled:opacity-50"></div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </main>

      {/* ADD STAFF MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
          <div className="bg-surface-container-lowest rounded-3xl shadow-2xl w-full max-w-md flex flex-col font-body animate-in zoom-in-95 duration-200 relative z-10">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-surface-container-low bg-surface-bright rounded-t-3xl">
              <h2 className="text-xl font-black text-primary font-mono tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px]">person_add</span>
                Add New Staff
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-on-surface-variant hover:text-on-surface transition-colors bg-surface-container-low hover:bg-surface-container-highest p-2 rounded-full active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveStaff} className="p-6 flex flex-col gap-5">
              <div>
                <label className="block text-[0.65rem] font-bold text-on-surface-variant uppercase tracking-widest font-mono mb-2">Full Name</label>
                <input
                  autoFocus
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full bg-surface-container-low border border-transparent rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/30 transition-all font-medium"
                  placeholder="e.g. John Doe"
                  required
                />
              </div>

              <div>
                <label className="block text-[0.65rem] font-bold text-on-surface-variant uppercase tracking-widest font-mono mb-2">System Role</label>
                <div className="relative">
                  <select
                    value={formRole}
                    onChange={e => setFormRole(e.target.value)}
                    className="w-full bg-surface-container-low border border-transparent rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/30 transition-all appearance-none cursor-pointer font-medium"
                  >
                    <option value="manager">Manager</option>
                    <option value="waiter">Waiter</option>
                    <option value="kitchen">Kitchen</option>
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-on-surface-variant">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[0.65rem] font-bold text-on-surface-variant uppercase tracking-widest font-mono mb-2">4-Digit Login PIN</label>
                <input
                  type="text"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={formPin}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFormPin(val);
                  }}
                  className="w-full bg-surface-container-low border border-transparent rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/30 transition-all font-mono tracking-[0.5em] text-lg text-center placeholder:tracking-normal placeholder:text-sm placeholder:font-sans placeholder:text-on-surface-variant/50"
                  placeholder="Enter 4 digits"
                  required
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-surface-container-low">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-full text-on-surface-variant hover:text-on-surface font-bold text-sm bg-transparent hover:bg-surface-container-high transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formName || formPin.length !== 4}
                  className="px-6 py-2.5 rounded-full bg-linear-to-br from-primary to-primary-container hover:opacity-90 disabled:opacity-50 text-white font-bold text-sm transition-colors shadow-[0_4px_12px_rgba(214,158,46,0.2)] active:scale-95"
                >
                  Save Staff Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
