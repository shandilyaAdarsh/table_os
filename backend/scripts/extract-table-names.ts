/**
 * Script to extract all unique table names referenced in the codebase
 * via .from('table_name') patterns
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const tableNames = new Set<string>();

function extractTablesFromFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // Match patterns like .from('table_name') or .from("table_name")
    const regex = /\.from\(['"]([a-z_]+)['"]\)/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      tableNames.add(match[1]);
    }
  } catch (error) {
    // Skip files that can't be read
  }
}

function walkDirectory(dir: string): void {
  try {
    const files = readdirSync(dir);
    
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      
      if (stat.isDirectory()) {
        if (!file.includes('node_modules') && !file.includes('.git')) {
          walkDirectory(filePath);
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        extractTablesFromFile(filePath);
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }
}

// Search backend src directory
const backendSrc = 'V:\\All Projects\\g8g ROS Main\\Orderlli\\tableos\\backend\\src';
console.log('Searching backend src directory...');
walkDirectory(backendSrc);

// Search supabase functions directory
const supabaseFunctions = 'V:\\All Projects\\g8g ROS Main\\Orderlli\\tableos\\supabase\\functions';
console.log('Searching supabase functions directory...');
walkDirectory(supabaseFunctions);

// Sort and display results
const sortedTables = Array.from(tableNames).sort();
console.log('\n=== All Referenced Tables ===');
sortedTables.forEach(table => console.log(table));
console.log(`\nTotal unique tables: ${sortedTables.length}`);
