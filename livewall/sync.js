import { spawnSync } from 'node:child_process';
// dev re-sync helper: copy livewall source into the installed profile copy.
// Usage: node sync.js   (idempotent)
const pairs = [
  ['F:\\dpharnesstest\\livewall\\package.json', 'C:\\Users\\lenovo\\.dsh\\profiles\\web\\node_modules\\dsh-livewall\\package.json'],
  ['F:\\dpharnesstest\\livewall\\lib\\index.js', 'C:\\Users\\lenovo\\.dsh\\profiles\\web\\node_modules\\dsh-livewall\\lib\\index.js'],
  ['F:\\dpharnesstest\\livewall\\lib\\client.js', 'C:\\Users\\lenovo\\.dsh\\profiles\\web\\node_modules\\dsh-livewall\\lib\\client.js']
];
for (const [src, dst] of pairs) {
  const r = spawnSync('cmd', ['/c', 'copy', '/Y', src, dst], { stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log('[sync] livewall -> profile done');
