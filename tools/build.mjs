// Сборка: склеивает src/js/*.js (по порядку имён) и src/style.css в один index.html.
// Запуск: node tools/build.mjs   (из корня репозитория)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const files = readdirSync(join(src, 'js')).filter(f => f.endsWith('.js')).sort();
const js = files.map(f => `// ───────────── src/js/${f} ─────────────\n` + readFileSync(join(src, 'js', f), 'utf8').replace(/\s+$/, '')).join('\n\n');
const css = readFileSync(join(src, 'style.css'), 'utf8').replace(/\s+$/, '');
const shell = readFileSync(join(src, 'shell.html'), 'utf8');
const banner = '<!-- СОБРАНО АВТОМАТИЧЕСКИ из src/ (node tools/build.mjs). Правьте исходники в src/, а не этот файл. -->\n';
const out = shell.replace('/*@@CSS@@*/', () => css).replace('/*@@JS@@*/', () => js).replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n' + banner);
writeFileSync(join(root, 'index.html'), out);
console.log(`index.html: ${files.length} js-файлов, ${(out.length / 1024).toFixed(0)} КБ`);
