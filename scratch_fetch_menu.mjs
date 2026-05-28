import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
);

async function fetchMenuItems() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, description');
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(JSON.stringify(data, null, 2));
}

fetchMenuItems().catch(console.error);
