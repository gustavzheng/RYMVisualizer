import {build} from 'esbuild';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(root, 'public/relation-walk/explore-3d.js')],
  outfile: join(root, 'public/relation-walk/explore-3d.bundle.js'),
  bundle: true,
  minify: true,
  target: 'es2017',
  format: 'iife',
  legalComments: 'eof',
});
