import fs from 'fs';
import path from 'path';

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Replace colors
  content = content.replace(/#1B2B4B/gi, '#E31E24'); // Navy to Red
  content = content.replace(/#1A365D/gi, '#E31E24'); // Dark Navy to Red
  content = content.replace(/#F97316/gi, '#E31E24'); // Orange to Red
  content = content.replace(/#FE932C/gi, '#E31E24'); // Light Orange to Red

  // Replace fonts
  content = content.replace(/Inter, sans-serif/gi, '"Plus Jakarta Sans", sans-serif');
  content = content.replace(/'Inter'/gi, '"Plus Jakarta Sans"');
  content = content.replace(/Epilogue/gi, 'Plus Jakarta Sans');
  content = content.replace(/Manrope/gi, 'Plus Jakarta Sans');

  fs.writeFileSync(filePath, content);
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js') || fullPath.endsWith('.css')) {
      replaceInFile(fullPath);
    }
  }
}

// Process customer app components and pages
processDirectory(path.join(process.cwd(), 'src/apps/customer'));
processDirectory(path.join(process.cwd(), 'src/components')); // if any

// Also patch index.css
replaceInFile(path.join(process.cwd(), 'src/index.css'));

// Inject Google Font into index.html if it's not there
const htmlPath = path.join(process.cwd(), 'index.html');
let html = fs.readFileSync(htmlPath, 'utf-8');
if (!html.includes('Plus+Jakarta+Sans')) {
  html = html.replace('</head>', `  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n</head>`);
  fs.writeFileSync(htmlPath, html);
}

console.log('Theme applied successfully!');
