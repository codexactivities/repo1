import { cp, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
const dest = new URL('../public/app/', import.meta.url);
await mkdir(dest, { recursive: true });
await cp(new URL('../web/', import.meta.url), dest, { recursive: true });
await build({ entryPoints: [new URL('../web/app.js', import.meta.url).pathname], outfile: new URL('app.js', dest).pathname, bundle: true, format: 'esm', target: 'es2022', minify: true, sourcemap: true });
