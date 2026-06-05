const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Colors
  content = content.replace(/#8D4B00/gi, '#E31E24');
  content = content.replace(/#FFF4EC/gi, '#FEE2E2');
  content = content.replace(/#B15F00/gi, '#B91C1C');
  content = content.replace(/#F5D19A/gi, '#FCA5A5');
  
  // Tailwind classes
  content = content.replace(/amber-500/g, 'red-600');
  content = content.replace(/amber-600/g, 'red-700');
  
  // Secondary, Neutral, Tertiary
  content = content.replace(/#191C1E/gi, '#1A1C1E'); // Secondary
  content = content.replace(/#F2F4F6/gi, '#F8F9FA'); // Neutral
  content = content.replace(/#F7F9FB/gi, '#F8F9FA'); // Neutral 
  content = content.replace(/#887364/gi, '#6C757D'); // Tertiary
  content = content.replace(/#554336/gi, '#6C757D'); // Secondary text -> Tertiary
  
  // Typography
  content = content.replace(/Inter/g, 'Plus Jakarta Sans');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

function traverse(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      traverse(fullPath);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js') || fullPath.endsWith('.css') || fullPath.endsWith('.html')) {
      replaceInFile(fullPath);
    }
  });
}

traverse(path.join(__dirname, '../../src/apps/kds'));
