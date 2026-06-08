export const menuItems = [
  { id: 'm1',  name: 'Crispy Calamari',          category: 'Starters',  price: 480,  station: 'fryer',   allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400' },
  { id: 'm2',  name: 'Paneer Tikka',              category: 'Starters',  price: 520,  station: 'grill',   allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400' },
  { id: 'm3',  name: 'Bruschetta',                category: 'Starters',  price: 360,  station: 'cold',    allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=400' },
  { id: 'm4',  name: 'Prawn Cocktail',            category: 'Starters',  price: 680,  station: 'cold',    allergen: 'SHELLFISH ALLERGY',           isAvailable: true,  image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400' },
  { id: 'm5',  name: 'Wagyu Burger',              category: 'Mains',     price: 1450, station: 'grill',   allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400' },
  { id: 'm6',  name: 'Truffle Mushroom Pasta',    category: 'Mains',     price: 980,  station: 'grill',   allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400' },
  { id: 'm7',  name: 'Grilled Salmon',            category: 'Mains',     price: 1200, station: 'grill',   allergen: 'FISH ALLERGY — verify sauce', isAvailable: true,  image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400' },
  { id: 'm8',  name: 'Chicken Tikka Masala',      category: 'Mains',     price: 780,  station: 'grill',   allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400' },
  { id: 'm9',  name: 'Beef Tenderloin',           category: 'Mains',     price: 1850, station: 'grill',   allergen: 'NUT ALLERGY — verify sauce',  isAvailable: true,  image: 'https://images.unsplash.com/photo-1558030006-450675393462?w=400' },
  { id: 'm10', name: 'Dal Makhani',               category: 'Mains',     price: 480,  station: 'grill',   allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400' },
  { id: 'm11', name: 'Truffle Fries',             category: 'Sides',     price: 380,  station: 'fryer',   allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400' },
  { id: 'm12', name: 'Garlic Naan',               category: 'Sides',     price: 160,  station: 'grill',   allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400' },
  { id: 'm13', name: 'Tiramisu',                  category: 'Desserts',  price: 420,  station: 'dessert', allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400' },
  { id: 'm14', name: 'Lemon Sorbet',              category: 'Desserts',  price: 320,  station: 'dessert', allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1488900128323-21503983a07e?w=400' },
  { id: 'm15', name: 'Mango Lassi',               category: 'Beverages', price: 240,  station: 'cold',    allergen: null,                          isAvailable: true,  image: 'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=400' },
];

export const tables = [
  { id: 'T01', status: 'occupied',        capacity: 4 },
  { id: 'T02', status: 'ready',           capacity: 2 },
  { id: 'T03', status: 'occupied',        capacity: 4 },
  { id: 'T04', status: 'vacant',          capacity: 6 },
  { id: 'T05', status: 'occupied',        capacity: 4 },
  { id: 'T06', status: 'vacant',          capacity: 2 },
  { id: 'T07', status: 'occupied',        capacity: 8 },
  { id: 'T08', status: 'vacant',          capacity: 4 },
  { id: 'T09', status: 'occupied',        capacity: 4 },
  { id: 'T10', status: 'payment_pending', capacity: 4 },
  { id: 'T11', status: 'occupied',        capacity: 6 },
  { id: 'T12', status: 'vacant',          capacity: 2 },
  { id: 'T13', status: 'needs_bussing',   capacity: 4 },
  { id: 'T14', status: 'occupied',        capacity: 4 },
  { id: 'T15', status: 'vacant',          capacity: 6 },
];

export const orders = [
  {
    id: '#1042', tableNum: 'T03',
    items: [
      { name: 'Wagyu Burger',    qty: 2, station: 'grill',   allergen: null,            note: '',              done: false },
      { name: 'Truffle Fries',   qty: 2, station: 'fryer',   allergen: null,            note: '',              done: false },
    ],
    status: 'preparing', elapsed: 434, isNew: false, note: '',
  },
  {
    id: '#1043', tableNum: 'T07',
    items: [
      { name: 'Grilled Salmon',  qty: 1, station: 'grill',   allergen: 'FISH ALLERGY', note: 'medium rare',   done: false },
      { name: 'Bruschetta',      qty: 1, station: 'cold',    allergen: null,            note: 'no garlic',     done: false },
    ],
    status: 'preparing', elapsed: 262, isNew: false, note: 'guest has fish allergy',
  },
  {
    id: '#1044', tableNum: 'T01',
    items: [
      { name: 'Crispy Calamari', qty: 1, station: 'fryer',   allergen: null,            note: '',              done: false },
      { name: 'Paneer Tikka',    qty: 2, station: 'grill',   allergen: null,            note: 'extra spicy',   done: false },
    ],
    status: 'pending', elapsed: 68, isNew: true, note: '',
  },
  {
    id: '#1045', tableNum: 'T11',
    items: [
      { name: 'Chicken Tikka Masala', qty: 2, station: 'grill',   allergen: null,       note: '',              done: true  },
      { name: 'Dal Makhani',          qty: 1, station: 'grill',   allergen: null,       note: '',              done: true  },
      { name: 'Garlic Naan',          qty: 4, station: 'grill',   allergen: null,       note: '',              done: true  },
    ],
    status: 'ready', elapsed: 710, isNew: false, note: '',
  },
  {
    id: '#1046', tableNum: 'T05',
    items: [
      { name: 'Truffle Mushroom Pasta', qty: 1, station: 'grill',   allergen: null,     note: 'NO PARMESAN',   done: false },
      { name: 'Tiramisu',               qty: 1, station: 'dessert', allergen: null,     note: 'extra warm',    done: false },
    ],
    status: 'preparing', elapsed: 510, isNew: false, note: 'no parmesan on pasta',
  },
];
