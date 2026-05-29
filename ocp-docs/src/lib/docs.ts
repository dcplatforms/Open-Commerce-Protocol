import fs from 'fs';
import path from 'path';

const CONTENT_PATH = path.join(process.cwd(), '../docs/product-hub/content');

export async function getDocBySlug(slug: string) {
  const filePath = path.join(CONTENT_PATH, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  return source;
}

export async function getAllDocSlugs() {
  if (!fs.existsSync(CONTENT_PATH)) return [];

  const getFiles = (dir: string): string[] => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
      .filter(e => !e.isDirectory() && e.name.endsWith('.md'))
      .map(e => path.join(dir, e.name));

    const folders = entries.filter(e => e.isDirectory());
    for (const folder of folders) {
      files.push(...getFiles(path.join(dir, folder.name)));
    }
    return files;
  };

  const allFiles = getFiles(CONTENT_PATH);
  return allFiles.map(file => {
    const relativePath = path.relative(CONTENT_PATH, file);
    return relativePath.replace(/\\/g, '/').replace(/\.md$/, '');
  });
}
