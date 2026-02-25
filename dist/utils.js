"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAvailablePort = exports.pathExists = exports.ensureBoringCache = void 0;
exports.execBoringCache = execBoringCache;
exports.wasCacheHit = wasCacheHit;
exports.getWorkspace = getWorkspace;
exports.getCacheTagPrefix = getCacheTagPrefix;
exports.getMiseBinPath = getMiseBinPath;
exports.getMiseDataDir = getMiseDataDir;
exports.installMise = installMise;
exports.installGo = installGo;
exports.activateGo = activateGo;
exports.getGoVersion = getGoVersion;
exports.getGoMajorMinor = getGoMajorMinor;
exports.configureGoEnv = configureGoEnv;
exports.getGoModCache = getGoModCache;
exports.getGoCacheDir = getGoCacheDir;
exports.validateGoVersion = validateGoVersion;
exports.configureGoCacheProgEnv = configureGoCacheProgEnv;
exports.startCacheRegistryProxy = startCacheRegistryProxy;
exports.stopCacheRegistryProxy = stopCacheRegistryProxy;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const action_core_1 = require("@boringcache/action-core");
Object.defineProperty(exports, "ensureBoringCache", { enumerable: true, get: function () { return action_core_1.ensureBoringCache; } });
Object.defineProperty(exports, "pathExists", { enumerable: true, get: function () { return action_core_1.pathExists; } });
Object.defineProperty(exports, "findAvailablePort", { enumerable: true, get: function () { return action_core_1.findAvailablePort; } });
const isWindows = process.platform === 'win32';
let lastOutput = '';
async function execBoringCache(args) {
    lastOutput = '';
    let output = '';
    const code = await (0, action_core_1.execBoringCache)(args, {
        silent: true,
        listeners: {
            stdout: (data) => {
                const text = data.toString();
                output += text;
                process.stdout.write(text);
            },
            stderr: (data) => {
                const text = data.toString();
                output += text;
                process.stderr.write(text);
            }
        }
    });
    lastOutput = output;
    return code;
}
function wasCacheHit(exitCode) {
    if (exitCode !== 0) {
        return false;
    }
    if (!lastOutput) {
        return true;
    }
    const missPatterns = [/Cache miss/i, /No cache entries/i, /Found 0\//i];
    return !missPatterns.some(pattern => pattern.test(lastOutput));
}
function getWorkspace(inputWorkspace) {
    return (0, action_core_1.getWorkspace)(inputWorkspace);
}
function getCacheTagPrefix(inputCacheTag) {
    return (0, action_core_1.getCacheTagPrefix)(inputCacheTag, 'go');
}
function getMiseBinPath() {
    const homedir = os.homedir();
    return isWindows
        ? path.join(homedir, '.local', 'bin', 'mise.exe')
        : path.join(homedir, '.local', 'bin', 'mise');
}
function getMiseDataDir() {
    if (isWindows) {
        return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'mise');
    }
    return path.join(os.homedir(), '.local', 'share', 'mise');
}
async function installMise() {
    core.info('Installing mise...');
    if (isWindows) {
        await installMiseWindows();
    }
    else {
        await exec.exec('sh', ['-c', 'curl https://mise.run | sh']);
    }
    core.addPath(path.dirname(getMiseBinPath()));
    core.addPath(path.join(getMiseDataDir(), 'shims'));
}
async function installMiseWindows() {
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
        await fs.promises.copyFile(path.join(tempDir, 'mise', 'bin', 'mise.exe'), getMiseBinPath());
    }
    finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
}
async function installGo(version) {
    core.info(`Installing Go ${version} via mise...`);
    const misePath = getMiseBinPath();
    await exec.exec(misePath, ['install', `go@${version}`]);
    await exec.exec(misePath, ['use', '-g', `go@${version}`]);
}
async function activateGo(version) {
    core.info(`Activating Go ${version}...`);
    const misePath = getMiseBinPath();
    await exec.exec(misePath, ['use', '-g', `go@${version}`]);
}
async function getGoVersion(inputVersion, workingDir) {
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
    }
    catch { }
    const goWork = path.join(workingDir, 'go.work');
    try {
        const content = await fs.promises.readFile(goWork, 'utf-8');
        const match = content.match(/^go\s+(\d+\.\d+(?:\.\d+)?)\s*$/m);
        if (match) {
            return match[1];
        }
    }
    catch { }
    const goVersionFile = path.join(workingDir, '.go-version');
    try {
        const content = await fs.promises.readFile(goVersionFile, 'utf-8');
        return content.trim().replace(/^go/, '');
    }
    catch { }
    const toolVersionsFile = path.join(workingDir, '.tool-versions');
    try {
        const content = await fs.promises.readFile(toolVersionsFile, 'utf-8');
        const goLine = content.split('\n').find(line => line.startsWith('golang '));
        if (goLine) {
            return goLine.split(/\s+/)[1].trim();
        }
    }
    catch { }
    try {
        let output = '';
        const result = await exec.exec('go', ['env', 'GOVERSION'], {
            ignoreReturnCode: true,
            silent: true,
            listeners: {
                stdout: (data) => { output += data.toString(); }
            }
        });
        if (result === 0 && output.trim()) {
            return output.trim().replace(/^go/, '');
        }
    }
    catch { }
    return '1.23';
}
function getGoMajorMinor(version) {
    const match = version.match(/^(\d+\.\d+)/);
    return match ? match[1] : version;
}
function configureGoEnv() {
    const gopath = process.env.GOPATH || path.join(os.homedir(), 'go');
    if (!process.env.GOPATH) {
        process.env.GOPATH = gopath;
        core.exportVariable('GOPATH', gopath);
    }
    core.addPath(path.join(gopath, 'bin'));
}
function getGoModCache() {
    if (process.env.GOMODCACHE) {
        return process.env.GOMODCACHE;
    }
    const gopath = process.env.GOPATH || path.join(os.homedir(), 'go');
    return path.join(gopath, 'pkg', 'mod');
}
function getGoCacheDir() {
    if (process.env.GOCACHE) {
        return process.env.GOCACHE;
    }
    const platform = os.platform();
    if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Caches', 'go-build');
    }
    else if (platform === 'win32') {
        const localAppData = process.env.LocalAppData || path.join(os.homedir(), 'AppData', 'Local');
        return path.join(localAppData, 'go-build');
    }
    return path.join(os.homedir(), '.cache', 'go-build');
}
async function validateGoVersion(version, needsCacheProg) {
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
function configureGoCacheProgEnv(port) {
    const gocacheprog = `boringcache go-cacheprog --endpoint http://127.0.0.1:${port}`;
    process.env.GOCACHEPROG = gocacheprog;
    core.exportVariable('GOCACHEPROG', gocacheprog);
    core.info(`GOCACHEPROG configured: endpoint=http://127.0.0.1:${port}`);
}
async function startCacheRegistryProxy(workspace, port, tag) {
    const proxy = await (0, action_core_1.startRegistryProxy)({
        command: 'cache-registry',
        workspace,
        tag,
        host: '127.0.0.1',
        port,
        noPlatform: true,
        noGit: true,
    });
    await (0, action_core_1.waitForProxy)(proxy.port, 30000, proxy.pid);
    return proxy;
}
async function stopCacheRegistryProxy(pid) {
    await (0, action_core_1.stopRegistryProxy)(pid);
}
