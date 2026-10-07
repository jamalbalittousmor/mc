// Пересборка index.html при изменении файлов в src/. Запуск: node tools/watch.mjs
import { watch } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), src = join(here, '..', 'src');
let t = 0;
const run = () => { try { execFileSync(process.execPath, [join(here, 'build.mjs')], { stdio: 'inherit' }); } catch (e) {} };
run();
watch(src, { recursive: true }, () => { clearTimeout(t); t = setTimeout(run, 120); });
console.log('Слежу за src/ …');
