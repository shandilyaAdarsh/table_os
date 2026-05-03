import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
)

async function checkColumns() {
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .limit(1)

  if (error) {
    console.error(error)
    return
  }

  if (data && data.length > 0) {
    console.log("Columns in order_items:", Object.keys(data[0]))
  } else {
    console.log("No data in order_items to check columns.")
  }
}

checkColumns()
