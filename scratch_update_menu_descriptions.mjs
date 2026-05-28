import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
);

const descriptions = {
  "Crispy Calamari": "Lightly battered and perfectly fried squid rings, served with a zesty lemon garlic aioli.",
  "Paneer Tikka": "An Indian dish made from chunks of paneer marinated in spices and grilled in a tandoor.",
  "Bruschetta": "Toasted artisan bread topped with a vibrant mix of fresh tomatoes, basil, garlic, and extra virgin olive oil.",
  "Prawn Cocktail": "Succulent prawns draped in a tangy Marie Rose sauce, served over a bed of crisp lettuce.",
  "Mezze Platter": "A delightful Mediterranean assortment of hummus, baba ganoush, tabbouleh, and warm pita bread.",
  "Wagyu Burger": "Premium Wagyu beef patty cooked to perfection, topped with aged cheddar and caramelized onions on a brioche bun.",
  "Truffle Mushroom Pasta": "Al dente fettuccine tossed in a rich, creamy wild mushroom sauce with a luxurious hint of black truffle.",
  "Grilled Salmon": "Fresh Atlantic salmon fillet expertly grilled, accompanied by seasonal roasted vegetables and dill sauce.",
  "Chicken Tikka Masala": "Tender pieces of marinated chicken simmered in a robust, creamy, and mildly spiced tomato curry.",
  "Beef Tenderloin": "A succulent, melt-in-your-mouth cut of premium beef tenderloin, seared to your liking with a red wine jus.",
  "Dal Makhani": "A classic Indian comfort dish of black lentils slowly simmered overnight with butter, cream, and aromatic spices.",
  "Paneer Butter Masala": "Soft paneer cubes bathed in a rich and creamy tomato-based gravy with a touch of fenugreek.",
  "Truffle Fries": "Crispy golden french fries tossed with truffle oil, parmesan cheese, and fresh parsley.",
  "Garlic Naan x2": "Two pieces of soft, pillowy Indian flatbread baked in a tandoor and brushed with aromatic garlic butter.",
  "Steamed Rice": "Fluffy, perfectly cooked long-grain Basmati rice, the ideal accompaniment to any curry.",
  "House Salad": "A refreshing mix of crisp garden greens, cherry tomatoes, cucumbers, and a light vinaigrette dressing.",
  "Masala Papad": "Crispy roasted papadums generously topped with a tangy mix of finely chopped onions, tomatoes, coriander, and spices.",
  "Tiramisu": "A classic Italian dessert featuring espresso-soaked ladyfingers layered with a delicate mascarpone cream.",
  "Gulab Jamun": "Soft, melt-in-your-mouth milk dumplings deep-fried to golden brown and soaked in a fragrant rose-cardamom syrup.",
  "Chocolate Fondant": "A decadent, warm chocolate cake with a rich, molten chocolate center, dusted with powdered sugar.",
  "Lemon Sorbet": "A light and refreshing dairy-free palate cleanser made with freshly squeezed lemons.",
  "Kulfi": "Traditional, dense Indian ice cream slowly churned and flavored with cardamom, pistachio, and saffron.",
  "Fresh Lime Soda": "A crisp, bubbly, and revitalizing beverage made with freshly squeezed lime juice and sparkling water.",
  "Mango Lassi": "A sweet, creamy, and refreshing traditional Indian yogurt drink blended with ripe Alphonso mangoes.",
  "Masala Chai": "Authentic Indian spiced tea brewed with black tea leaves, milk, cardamom, cinnamon, and ginger."
};

async function updateDescriptions() {
  console.log('Starting menu item updates...');
  
  for (const [name, desc] of Object.entries(descriptions)) {
    const { error } = await supabase
      .from('menu_items')
      .update({ description: desc })
      .eq('name', name);
      
    if (error) {
      console.error(`Failed to update ${name}:`, error.message);
    } else {
      console.log(`Updated: ${name}`);
    }
  }
  
  console.log('All menu item descriptions updated successfully!');
}

updateDescriptions().catch(console.error);
