import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { packager } from '@electron/packager';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version, electronVersion = pkg.devDependencies.electron;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Release version must use x.y.z');
const targets = { 'mac-arm64': ['darwin', 'arm64'], 'mac-x64': ['darwin', 'x64'], 'windows-x64': ['win32', 'x64'] };
const target = process.argv[2];
if (!targets[target]) throw Error('Usage: node scripts/build-release.mjs mac-arm64|mac-x64|windows-x64');
const [platform, arch] = targets[target];
if (process.platform !== 'darwin' && platform === 'darwin') throw Error('Mac signing and DMG creation require macOS');
const zipDir = process.env.WONANGFEI_ELECTRON_ZIP_DIR;
if (!zipDir) throw Error('Set WONANGFEI_ELECTRON_ZIP_DIR to an existing verified official Electron ZIP directory');
const runtime = path.join(zipDir, `electron-v${electronVersion}-${platform}-${arch}.zip`);
await fs.access(runtime);
const base = path.join(root, 'dist-release', `v${version}`);
const payloadName = platform === 'darwin' ? `窝囊费-darwin-${arch}` : 'Wonangfei-win32-x64';
try { await fs.access(path.join(base, 'payload', payloadName)); throw Error('Existing payload will not be overwritten'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const stage = await fs.mkdtemp(path.join(root, '.release-build-input-'));
try {
  // Only product code and assets enter the application. No profiles, tests or build tools.
  for (const directory of ['desktop', 'src']) await fs.cp(path.join(root, directory), path.join(stage, directory), { recursive: true, dereference: false });
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'wonangfei', version, releaseChannel:pkg.releaseChannel, main: 'desktop/main.cjs', description: pkg.description, author: 'Wonangfei' }, null, 2));
  const options = {
    dir: stage, name: platform === 'darwin' ? '窝囊费' : 'Wonangfei', executableName: 'Wonangfei',
    appBundleId: 'local.wonangfei.trial', helperBundleId: 'local.wonangfei.trial.helper',
    appVersion: version, buildVersion: platform === 'darwin' ? '20261104.5' : `${version}.0`,
    platform, arch, electronVersion, electronZipDir: zipDir,
    out: path.join(base, 'payload'), overwrite: false, asar: true, prune: false,
    icon: path.join(root, 'src/icons', platform === 'darwin' ? 'Wonangfei.icns' : 'Wonangfei.ico'),
    appCopyright: 'Wonangfei'
  };
  if (platform === 'darwin') {
    options.extendInfo = { CFBundleDisplayName: '窝囊费', LSMinimumSystemVersion: '13.0' };
    // Ad-hoc identities have no Team ID. No hardened-runtime claim or Gatekeeper bypass.
    options.osxSign = { identity: '-', identityValidation: false, continueOnError: false, preAutoEntitlements: false, preEmbedProvisioningProfile: false, strictVerify: true, optionsForFile: () => ({ timestamp: 'none', hardenedRuntime: false, entitlements: ['com.apple.security.cs.allow-jit'] }) };
  } else {
    options.win32metadata = { CompanyName: 'Wonangfei', FileDescription: '窝囊费 · 本地桌面体验版', ProductName: '窝囊费', InternalName: 'Wonangfei', OriginalFilename: 'Wonangfei.exe' };
  }
  const [output] = await packager(options);
  if (platform === 'darwin') execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', path.join(output, '窝囊费.app')], { stdio: 'inherit' });
  const asar = path.join(output, platform === 'darwin' ? '窝囊费.app/Contents/Resources/app.asar' : 'resources/app.asar');
  const record = { version, electronVersion, target, output, asarSHA256: crypto.createHash('sha256').update(await fs.readFile(asar)).digest('hex'), minimumSystem: platform === 'darwin' ? 'macOS 13' : 'Windows 10 x64', signing: platform === 'darwin' ? 'ad-hoc; no Developer ID; not notarized' : 'unsigned', runtimeTested: false };
  await fs.mkdir(path.join(root, 'evidence', `release-${version}`), { recursive: true });
  await fs.writeFile(path.join(root, 'evidence', `release-${version}`, `build-${target}.json`), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
} finally { await fs.rm(stage, { recursive: true, force: true }); }
