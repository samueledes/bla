/* Bundles index.html + styles.css + spring.js + benches.js into a single
   self-contained fragment (no <html>/<head>/<body>) for publishing as an
   Artifact, where a strict CSP blocks every external request. */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFile(join(root, f), 'utf8');

const [html, css, spring, benches] = await Promise.all(
  ['index.html', 'styles.css', 'spring.js', 'benches.js'].map(read)
);

const body = html.split('<!-- ARTIFACT:BODY:START -->')[1].split('<!-- ARTIFACT:BODY:END -->')[0];
const title = html.match(/<title>([^<]*)<\/title>/)[1];
const description = html.match(/name="description" content="([^"]*)"/)[1];

// Concatenate the two modules into one inline module: drop the import and the
// export keywords, since everything now shares a single module scope.
const js = [
  spring.replace(/^export\s+/gm, ''),
  benches.replace(/^import\s[\s\S]*?;\s*$/m, ''),
].join('\n');

// Emitted first, and well inside the first 1024 bytes, so the page still
// decodes as UTF-8 if the host serves it without a charset header.
const out = `<meta charset="utf-8" />
<title>${title}</title>
<meta name="description" content="${description}" />
<style>
${css}
</style>
${body.replace(/<script type="module" src="benches\.js"><\/script>/, '')}
<script type="module">
${js}
</script>
`;

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist', 'bench.html'), out);
console.log(`dist/bench.html — ${(out.length / 1024).toFixed(1)} KB`);
