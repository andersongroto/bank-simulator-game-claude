#!/usr/bin/env node
// Gera uma versão do jogo em um único arquivo HTML, com CSS e JavaScript embutidos.
// Uso:
//   node scripts/build.js                 -> dist/banqueiro-sa.html (documento completo)
//   node scripts/build.js --fragment SAIDA -> só título, estilos e conteúdo, para hosts que
//                                            já fornecem <!doctype>, <head> e <body>
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find((a) => !a.startsWith('--')) ||
  path.join(root, 'dist', fragment ? 'banqueiro-sa.fragment.html' : 'banqueiro-sa.html');

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let html = read('index.html');

html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${read('css/style.css')}</style>`);
html = html.replace(/<script src="(js\/[\w.-]+\.js)"><\/script>/g, (_, src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(`${src} contém "</script" e não pode ser embutido.`);
  return `<script>\n${code}</script>`;
});

if (fragment) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/, '')
    .replace(/<meta name="viewport"[^>]*>\s*/, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  html = `${head.trim()}\n${body.trim()}\n`;
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Gerado ${path.relative(process.cwd(), out)} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
