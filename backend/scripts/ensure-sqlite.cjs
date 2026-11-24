const { spawnSync } = require('node:child_process');
const path = require('node:path');

try {
  // Test if sqlite3 can be loaded without dynamic linking errors
  require('sqlite3');
  console.log('[ensure-sqlite] sqlite3 loaded successfully.');
} catch (error) {
  if (process.platform === 'linux' && (error.code === 'ERR_DLOPEN_FAILED' || /GLIBC/i.test(error.message))) {
    console.log(`[ensure-sqlite] Detected incompatible binary for Linux: ${error.message}`);
    console.log('[ensure-sqlite] Rebuilding sqlite3 from source for this system...');
    const result = spawnSync('npm', ['rebuild', 'sqlite3', '--build-from-source'], {
      stdio: 'inherit',
      shell: true,
      cwd: path.resolve(__dirname, '..'),
    });
    if (result.status !== 0) {
      console.error('[ensure-sqlite] Failed to rebuild sqlite3 from source, exit code:', result.status);
      process.exit(result.status || 1);
    }
    console.log('[ensure-sqlite] Rebuilding sqlite3 completed successfully.');
  } else {
    throw error;
  }
}
