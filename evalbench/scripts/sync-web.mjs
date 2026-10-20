import { cp, mkdir } from 'node:fs/promises';
await mkdir(new URL('../public/app/', import.meta.url), { recursive: true });
await cp(new URL('../web/', import.meta.url), new URL('../public/app/', import.meta.url), { recursive: true });
