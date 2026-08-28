import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const scanTargets = [
  'src',
  'public',
  'index.html',
  'manifest.json',
  'metadata.json',
  'server.ts',
  'vite.config.ts',
  'tailwind.config.cjs',
  'postcss.config.cjs'
];

const allowedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.html',
  '.css',
  '.cjs',
  '.mjs',
  '.md'
]);

const blockedDirs = new Set(['node_modules', 'dist', '.git', 'qa-screenshots']);

const mojibakePatterns = [
  /�/,
  /ï¿½/,
  /Ã./,
  /Â./,
  /Ã[\u0080-\u00BF]/,
  /Ãƒ/,
  /Ã‚/,
  /Â[\u0080-\u00BF]/,
  /â€[œ˜™]/,
  /â€“|â€”|â€¦|â€¢|â„¢/
];

const getExtension = (filePath) => {
  const match = filePath.match(/(\.[^.\\/]+)$/);
  return match ? match[1].toLowerCase() : '';
};

const walk = (target, files = []) => {
  const fullPath = join(root, target);
  const stats = statSync(fullPath);

  if (stats.isDirectory()) {
    const dirName = fullPath.split(/[\\/]/).pop();
    if (blockedDirs.has(dirName)) return files;
    for (const entry of readdirSync(fullPath)) {
      walk(join(target, entry), files);
    }
    return files;
  }

  if (allowedExtensions.has(getExtension(fullPath))) {
    files.push(fullPath);
  }

  return files;
};

const files = scanTargets.flatMap((target) => walk(target));
const findings = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of mojibakePatterns) {
      if (pattern.test(line)) {
        findings.push({
          file: relative(root, file),
          line: index + 1,
          text: line.trim()
        });
        break;
      }
    }
  });
}

if (findings.length > 0) {
  console.error('Mojibake or damaged text found:');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.text}`);
  }
  process.exit(1);
}

console.log('No mojibake found.');
