import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { useAuthStore } from '../../../store/authStore.js';

// const TENANT_ID = '...'; 


const CATEGORIES = ['All', 'Starters', 'Mains', 'Sides', 'Desserts', 'Beverages'];
const STATIONS = ['HOT', 'GRILL', 'FRY', 'COLD', 'BAR', 'BREAD'];
const ALLERGENS = ['None', 'GLUTEN', 'DAIRY', 'SHELLFISH', 'FISH', 'NUT'];

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

export default function MenuManagement() {
  const { tenantId: TENANT_ID } = useAuthStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: 'Starters',
    price: '',
    station: 'HOT',
    allergen: 'None',
    description: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Initial Fetch & Subscription
  useEffect(() => {
    fetchItems();

    const subscription = supabase
      .channel('menu_items_realtime')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'menu_items',
        filter: `tenant_id=eq.${TENANT_ID}`
      }, () => {
        fetchItems();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .order('sort_order', { ascending: true });
    
    if (data) setItems(data);
    setLoading(false);
  };

  const toggleAvailable = async (item) => {
    // Optimistic UI update could be applied here if desired
    await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id);
  };

  const handleAddNew = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      category: 'Starters',
      price: '',
      station: 'HOT',
      allergen: 'None',
      description: ''
    });
    setConfirmDelete(false);
    setModalOpen(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      category: item.category || 'Starters',
      price: item.price?.toString() || '',
      station: item.station || 'HOT',
      allergen: item.allergen || 'None',
      description: item.description || ''
    });
    setConfirmDelete(false);
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price || isSaving) return;
    
    setIsSaving(true);
    const payload = {
      name: formData.name,
      category: formData.category,
      price: parseFloat(formData.price),
      station: formData.station,
      allergen: formData.allergen === 'None' ? null : formData.allergen,
      description: formData.description || null
    };

    if (editingItem) {
      await supabase.from('menu_items').update(payload).eq('id', editingItem.id);
    } else {
      await supabase.from('menu_items').insert({
        ...payload,
        tenant_id: TENANT_ID,
        is_available: true,
        sort_order: items.length + 1
      });
    }

    setIsSaving(false);
    setModalOpen(false);
  };

  const handleDelete = async () => {
    if (!editingItem || isDeleting) return;
    setIsDeleting(true);
    await supabase.from('menu_items').delete().eq('id', editingItem.id);
    setIsDeleting(false);
    setModalOpen(false);
  };

  const filteredItems = items.filter(i => {
    const matchesSearch = i.name?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || i.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col min-h-screen text-on-surface font-body pb-[calc(84px+env(safe-area-inset-bottom))]">
      <main className="max-w-[390px] md:max-w-7xl mx-auto w-full px-4 pt-6 space-y-6">
        
        {/* Search Bar */}
        <div className="relative mx-auto max-w-lg md:max-w-none md:w-80">
           <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-[1.25rem]">search</span>
           <input 
             className="w-full bg-surface-container-low border-none rounded-full py-3.5 pl-12 pr-4 text-sm focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/30 transition-all placeholder:text-on-surface-variant/50" 
             placeholder="Search items..." 
             type="text"
             value={search}
             onChange={(e) => setSearch(e.target.value)}
           />
        </div>

        {/* Category Filter Pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
           {CATEGORIES.map(cat => (
             <button
               key={cat}
               onClick={() => setActiveCategory(cat)}
               className={`shrink-0 px-5 py-2 rounded-full text-xs font-bold tracking-wide uppercase transition-all ${activeCategory === cat ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant hover:opacity-80'}`}
             >
               {cat}
             </button>
           ))}
        </div>

        {/* Menu Item Grid */}
        <div className="flex-1 pb-10">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-surface-container-lowest shadow-[0_4px_12px_rgba(20,27,43,0.02)] rounded-xl p-10 text-center">
              <p className="text-on-surface-variant opacity-80 text-sm">No items found matching the current filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredItems.map(item => {
                const is86d = !item.is_available;

                return (
                  <div key={item.id} className="bg-surface-container-lowest shadow-[0_4px_12px_rgba(20,27,43,0.04)] rounded-xl p-3 flex flex-col h-[180px] relative group pointer-events-auto">
                    <button 
                      onClick={() => handleEdit(item)}
                      className="absolute top-2 right-2 p-1.5 z-10 bg-surface-container-low/80 backdrop-blur-md rounded-full active:scale-95 transition-transform"
                    >
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
                    </button>
                    
                    <div className="grow flex flex-col justify-center">
                       <span className="text-[10px] font-bold text-primary tracking-widest uppercase mb-1">
                         {item.station}
                       </span>
                       <h3 className={`font-bold text-sm leading-tight mb-1 ${is86d ? 'text-on-surface-variant opacity-60' : 'text-on-surface'}`}>
                         {item.name}
                       </h3>
                       <div className="flex gap-1 mb-2">
                         {item.allergen && item.allergen !== 'None' && (
                           <span className="px-1.5 py-0.5 bg-error-container text-[9px] font-bold rounded text-on-error-container">
                             {item.allergen.charAt(0)}
                           </span>
                         )}
                       </div>
                       <div className="mt-auto flex items-end justify-between">
                         <span className={`font-bold tabular-nums text-base ${is86d ? 'text-on-surface-variant opacity-60' : 'text-amber-600'}`}>
                           {formatCurrency(item.price)}
                         </span>
                       </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-surface-container flex items-center justify-between cursor-pointer" onClick={() => toggleAvailable(item)}>
                       <span className={`text-[10px] font-bold ${is86d ? 'text-error' : 'text-on-surface-variant'}`}>
                         {is86d ? "86'D" : "AVAILABLE"}
                       </span>
                       <div className={`w-8 h-4 rounded-full relative shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] transition-colors duration-200 ${is86d ? 'bg-error/30' : 'bg-emerald-500'}`}>
                         <div className={`absolute top-[2px] w-3 h-3 bg-white rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-200 ${is86d ? 'left-[2px]' : 'right-[2px]'}`}></div>
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

      {/* Slide-Up / Centered Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-60 flex items-end md:items-center justify-center pointer-events-auto">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm transition-opacity" 
            onClick={() => !isSaving && setModalOpen(false)} 
          />
          
          <div className="bg-surface-container-lowest rounded-t-3xl md:rounded-2xl shadow-2xl w-full max-w-lg relative z-10 flex flex-col max-h-[90vh] md:max-h-[85vh] animate-in slide-in-from-bottom md:zoom-in-95 pb-[env(safe-area-inset-bottom)] md:pb-0">
            
            {/* Mobile Drag Handle */}
            <div className="md:hidden w-full flex justify-center pt-4 pb-2" onClick={() => !isSaving && setModalOpen(false)}>
              <div className="w-12 h-1.5 bg-surface-container-high rounded-full" />
            </div>

            <div className="px-6 py-4 md:py-6 border-b border-surface-container-low flex justify-between items-center shrink-0 bg-surface-bright rounded-t-3xl md:rounded-t-2xl">
              <h2 className="text-xl font-black font-mono text-primary">
                {editingItem ? 'Edit Item' : 'New Menu Item'}
              </h2>
              <button disabled={isSaving} onClick={() => setModalOpen(false)} className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors p-2 hidden md:block active:scale-95">
                <span className="material-symbols-outlined text-[1.25rem]">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-auto p-6 space-y-5">
              <div>
                <label className="block text-[0.65rem] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Item Name *</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-surface-container-low border-transparent rounded-xl px-4 py-3 text-base md:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[0.65rem] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Category</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-surface-container-low border-transparent rounded-xl px-4 py-3 text-base md:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 transition-all font-medium appearance-none"
                  >
                    {CATEGORIES.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[0.65rem] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Price (₹) *</label>
                  <input 
                    required
                    type="number" 
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                    className="w-full bg-surface-container-low border-transparent rounded-xl px-4 py-3 text-base md:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 transition-all tabular-nums font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[0.65rem] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Station Routing</label>
                  <select 
                    value={formData.station}
                    onChange={(e) => setFormData({...formData, station: e.target.value})}
                    className="w-full bg-surface-container-low border-transparent rounded-xl px-4 py-3 text-base md:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 transition-all font-medium appearance-none"
                  >
                    {STATIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[0.65rem] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Allergen Warning</label>
                  <select 
                    value={formData.allergen}
                    onChange={(e) => setFormData({...formData, allergen: e.target.value})}
                    className="w-full bg-surface-container-low border-transparent rounded-xl px-4 py-3 text-base md:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 transition-all font-medium appearance-none"
                  >
                    {ALLERGENS.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[0.65rem] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Description (Optional)</label>
                <textarea 
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-surface-container-low border-transparent rounded-xl px-4 py-3 text-base md:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 transition-all font-medium resize-none"
                />
              </div>
            </form>

            <div className="px-6 py-4 border-t border-surface-container-low flex justify-between items-center shrink-0">
              {editingItem ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-error text-[0.65rem] font-bold uppercase tracking-widest">Confirm delete?</span>
                    <button 
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-error-container text-on-error-container px-3 py-1.5 rounded-lg text-xs font-bold transition-colors active:scale-95"
                    >
                      {isDeleting ? "..." : "YES"}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={isDeleting}
                      className="bg-surface-container text-on-surface-variant px-3 py-1.5 rounded-lg text-xs font-bold transition-colors active:scale-95"
                    >
                      NO
                    </button>
                  </div>
                ) : (
                  <button 
                    type="button" 
                    onClick={() => setConfirmDelete(true)}
                    className="text-on-surface-variant hover:text-error transition-colors p-2 rounded-full hover:bg-error-container active:scale-95"
                    title="Delete Item"
                  >
                    <span className="material-symbols-outlined text-[1.25rem]">delete</span>
                  </button>
                )
              ) : (
                <div />
              )}

              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={isSaving}
                  className="px-5 py-2 min-h-[44px] rounded-full text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving || isDeleting || !formData.name || !formData.price}
                  className="px-5 py-2 min-h-[44px] rounded-full text-sm font-bold bg-primary-container text-on-primary-container hover:opacity-90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
