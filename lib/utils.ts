import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ensureBoringCache,
  execBoringCache as execBoringCacheCore,
  getWorkspace as getWorkspaceCore,
  getCacheTagPrefix as getCacheTagPrefixCore,
  pathExists,
  startRegistryProxy,
  waitForProxy,
  stopRegistryProxy,
  findAvailablePort,
} from '@boringcache/action-core';

export {
  ensureBoringCache,
  pathExists,
  findAvailablePort,
};

const isWindows = process.platform === 'win32';

let lastOutput = '';

export async function execBoringCache(args: string[]): Promise<number> {
  lastOutput = '';
  let output = '';

  const code = await execBoringCacheCore(args, {
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      },
      stderr: (data: Buffer) => {
        const text = data.toString();
        output += text;
        process.stderr.write(text);
      }
    }
  });

  lastOutput = output;
  return code;
}

export function wasCacheHit(exitCode: number): boolean {
  if (exitCode !== 0) {
    return false;
  }

  if (!lastOutput) {
    return true;
  }

  const missPatterns = [/Cache miss/i, /No cache entries/i, /Found 0\//i];
  return !missPatterns.some(pattern => pattern.test(lastOutput));
}

export function getWorkspace(inputWorkspace: string): string {
  return getWorkspaceCore(inputWorkspace);
}

export function getCacheTagPrefix(inputCacheTag: string): string {
  return getCacheTagPrefixCore(inputCacheTag, 'go');
}

export function getMiseBinPath(): string {
  const homedir = os.homedir();
  return isWindows
    ? path.join(homedir, '.local', 'bin', 'mise.exe')
    : path.join(homedir, '.local', 'bin', 'mise');
}

export function getMiseDataDir(): string {
  if (isWindows) {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'mise');
  }
  return path.join(os.homedir(), '.local', 'share', 'mise');
}

export async function installMise(): Promise<void> {
  core.info('Installing mise...');
  if (isWindows) {
    await installMiseWindows();
  } else {
    await exec.exec('sh', ['-c', 'curl https://mise.run | sh']);
  }

  core.addPath(path.dirname(getMiseBinPath()));
  core.addPath(path.join(getMiseDataDir(), 'shims'));
}

async function installMiseWindows(): Promise<void> {
  const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
  const miseVersion = process.env.MISE_VERSION || 'v2026.2.8';
  const url = `https://github.com/jdx/mise/releases/download/${miseVersion}/mise-${miseVersion}-windows-${arch}.zip`;

  const binDir = path.dirname(getMiseBinPath());
  await fs.promises.mkdir(binDir, { recursive: true });

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mise-'));
  try {
    const zipPath = path.join(tempDir, 'mise.zip');
    await exec.exec('curl', ['-fsSL', '-o', zipPath, url]);
    await exec.exec('tar', ['-xf', zipPath, '-C', tempDir]);
    await fs.promises.copyFile(
      path.join(tempDir, 'mise', 'bin', 'mise.exe'),
      getMiseBinPath(),
    );
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function installGo(version: string): Promise<void> {
  core.info(`Installing Go ${version} via mise...`);
  const misePath = getMiseBinPath();

  await exec.exec(misePath, ['install', `go@${version}`]);
  await exec.exec(misePath, ['use', '-g', `go@${version}`]);
}

export async function activateGo(version: string): Promise<void> {
  core.info(`Activating Go ${version}...`);
  const misePath = getMiseBinPath();

  await exec.exec(misePath, ['use', '-g', `go@${version}`]);
}

export async function getGoVersion(inputVersion: string, workingDir: string): Promise<string> {
  if (inputVersion) {
    return inputVersion;
  }

  const goMod = path.join(workingDir, 'go.mod');
  try {
    const content = await fs.promises.readFile(goMod, 'utf-8');
    const match = content.match(/^go\s+(\d+\.\d+(?:\.\d+)?)\s*$/m);
    if (match) {
      return match[1];
    }
  } catch {}

  const goWork = path.join(workingDir, 'go.work');
  try {
    const content = await fs.promises.readFile(goWork, 'utf-8');
    const match = content.match(/^go\s+(\d+\.\d+(?:\.\d+)?)\s*$/m);
    if (match) {
      return match[1];
    }
  } catch {}

  const goVersionFile = path.join(workingDir, '.go-version');
  try {
    const content = await fs.promises.readFile(goVersionFile, 'utf-8');
    return content.trim().replace(/^go/, '');
  } catch {}

  const toolVersionsFile = path.join(workingDir, '.tool-versions');
  try {
    const content = await fs.promises.readFile(toolVersionsFile, 'utf-8');
    const goLine = content.split('\n').find(line => line.startsWith('golang '));
    if (goLine) {
      return goLine.split(/\s+/)[1].trim();
    }
  } catch {}

  try {
    let output = '';
    const result = await exec.exec('go', ['env', 'GOVERSION'], {
      ignoreReturnCode: true,
      silent: true,
      listeners: {
        stdout: (data: Buffer) => { output += data.toString(); }
      }
    });
    if (result === 0 && output.trim()) {
      return output.trim().replace(/^go/, '');
    }
  } catch {}

  return '1.23';
}

export function getGoMajorMinor(version: string): string {
  const match = version.match(/^(\d+\.\d+)/);
  return match ? match[1] : version;
}

export function configureGoEnv(): void {
  const gopath = process.env.GOPATH || path.join(os.homedir(), 'go');

  if (!process.env.GOPATH) {
    process.env.GOPATH = gopath;
    core.exportVariable('GOPATH', gopath);
  }

  core.addPath(path.join(gopath, 'bin'));
}

export function getGoModCache(): string {
  if (process.env.GOMODCACHE) {
    return process.env.GOMODCACHE;
  }
  const gopath = process.env.GOPATH || path.join(os.homedir(), 'go');
  return path.join(gopath, 'pkg', 'mod');
}

export function getGoCacheDir(): string {
  if (process.env.GOCACHE) {
    return process.env.GOCACHE;
  }

  const platform = os.platform();
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'go-build');
  } else if (platform === 'win32') {
    const localAppData = process.env.LocalAppData || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'go-build');
  }
  return path.join(os.homedir(), '.cache', 'go-build');
}

export async function validateGoVersion(version: string, needsCacheProg: boolean): Promise<void> {
  if (!needsCacheProg) {
    return;
  }

  const majorMinor = getGoMajorMinor(version);
  const parts = majorMinor.split('.');
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);

  if (major < 1 || (major === 1 && minor < 24)) {
    throw new Error(`GOCACHEPROG requires Go 1.24+, detected ${version}`);
  }
}

export function configureGoCacheProgEnv(port: number): void {
  const gocacheprog = `boringcache go-cacheprog --endpoint http://127.0.0.1:${port}`;

  process.env.GOCACHEPROG = gocacheprog;
  core.exportVariable('GOCACHEPROG', gocacheprog);

  core.info(`GOCACHEPROG configured: endpoint=http://127.0.0.1:${port}`);
}

export async function startCacheRegistryProxy(workspace: string, port: number, tag: string): Promise<{ pid: number; port: number }> {
  const proxy = await startRegistryProxy({
    command: 'cache-registry',
    workspace,
    tag,
    host: '127.0.0.1',
    port,
    noPlatform: true,
    noGit: true,
  });
  await waitForProxy(proxy.port, 30000, proxy.pid);
  return proxy;
}

export async function stopCacheRegistryProxy(pid: number): Promise<void> {
  await stopRegistryProxy(pid);
}
