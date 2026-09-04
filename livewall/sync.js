// dev re-sync helper: copy the livewall package into your installed profile
// copy of dsh-livewall.
//
// Usage:  node sync.js    (run from inside the livewall/ package directory)
//
// No machine-specific paths:
//   source = the current package directory (cwd)
//   dest   = $DSH_LIVEWALL_DEST_DIR, or
//            $DSH_HOME\profiles\web\node_modules\dsh-livewall, or
//            %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-livewall
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url)); // this package directory
const destRoot = process.env.DSH_LIVEWALL_DEST_DIR
  || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', 'web', 'node_modules', 'dsh-livewall');

const pairs = [
  [join(root, 'package.json'), join(destRoot, 'package.json')],
  [join(root, 'lib', 'index.js'), join(destRoot, 'lib', 'index.js')],
  [join(root, 'lib', 'client.js'), join(destRoot, 'lib', 'client.js')]
];
for (const [src, dst] of pairs) {
  const r = spawnSync('cmd', ['/c', 'copy', '/Y', src, dst], { stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log('[sync] livewall -> ' + destRoot);
