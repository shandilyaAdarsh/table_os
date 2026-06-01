import fs from 'fs';
import path from 'path';

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Replace text colors
  content = content.replace(/#111827/gi, '#1A1C1E'); // Gray-900 to Secondary
  content = content.replace(/#6B7280/gi, '#6C757D'); // Gray-500 to Tertiary

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

processDirectory(path.join(process.cwd(), 'src/apps/customer'));
processDirectory(path.join(process.cwd(), 'src/components')); // if any
replaceInFile(path.join(process.cwd(), 'src/index.css'));

console.log('Text colors applied successfully!');
