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
const core = __importStar(require("@actions/core"));
const utils_1 = require("./utils");
async function run() {
    try {
        const workspace = (0, utils_1.getWorkspace)(core.getInput('workspace'));
        const cacheTagPrefix = (0, utils_1.getCacheTagPrefix)(core.getInput('cache-tag'));
        const inputVersion = core.getInput('go-version');
        const workingDir = core.getInput('working-directory') || process.cwd();
        const cacheGo = core.getInput('cache-go') !== 'false';
        const cacheModules = core.getInput('cache-modules') !== 'false';
        const cacheBuild = core.getInput('cache-build') !== 'false';
        const useGoCacheProg = core.getInput('gocacheprog') === 'true';
        const verbose = core.getInput('verbose') === 'true';
        const cliVersion = core.getInput('cli-version');
        const goVersion = await (0, utils_1.getGoVersion)(inputVersion, workingDir);
        const goMajorMinor = (0, utils_1.getGoMajorMinor)(goVersion);
        core.saveState('workspace', workspace);
        core.saveState('cacheTagPrefix', cacheTagPrefix);
        core.saveState('goVersion', goVersion);
        core.saveState('workingDir', workingDir);
        core.saveState('cacheGo', cacheGo.toString());
        core.saveState('cacheModules', cacheModules.toString());
        core.saveState('cacheBuild', cacheBuild.toString());
        core.saveState('useGoCacheProg', useGoCacheProg.toString());
        core.saveState('verbose', verbose.toString());
        if (cliVersion.toLowerCase() !== 'skip') {
            await (0, utils_1.ensureBoringCache)({ version: cliVersion });
        }
        const miseDataDir = (0, utils_1.getMiseDataDir)();
        const goTag = `${cacheTagPrefix}-go-${goVersion}`;
        let goCacheHit = false;
        if (cacheGo) {
            core.info(`Restoring Go ${goVersion}...`);
            const goArgs = ['restore', workspace, `${goTag}:${miseDataDir}`];
            if (verbose)
                goArgs.push('--verbose');
            const goResult = await (0, utils_1.execBoringCache)(goArgs);
            goCacheHit = (0, utils_1.wasCacheHit)(goResult);
            core.setOutput('go-cache-hit', goCacheHit.toString());
        }
        await (0, utils_1.installMise)();
        if (goCacheHit) {
            await (0, utils_1.activateGo)(goVersion);
        }
        else {
            await (0, utils_1.installGo)(goVersion);
        }
        (0, utils_1.configureGoEnv)();
        await (0, utils_1.validateGoVersion)(goVersion, useGoCacheProg);
        const modulesTag = `${cacheTagPrefix}-go-modules`;
        const buildTag = `${cacheTagPrefix}-go-build-${goMajorMinor}`;
        core.setOutput('workspace', workspace);
        core.setOutput('go-version', goVersion);
        core.setOutput('cache-tag', cacheTagPrefix);
        core.setOutput('modules-tag', modulesTag);
        core.setOutput('build-tag', buildTag);
        let modulesRestored = false;
        if (cacheModules) {
            const goModCache = (0, utils_1.getGoModCache)();
            core.info('Restoring Go module cache from BoringCache...');
            const args = ['restore', workspace, `${modulesTag}:${goModCache}`];
            if (verbose)
                args.push('--verbose');
            const result = await (0, utils_1.execBoringCache)(args);
            if ((0, utils_1.wasCacheHit)(result)) {
                core.info('Go module cache restored');
                modulesRestored = true;
            }
            else {
                core.info('Go module cache not in cache');
            }
            core.saveState('modulesTag', modulesTag);
            core.saveState('modulesRestored', modulesRestored.toString());
        }
        let buildRestored = false;
        if (useGoCacheProg) {
            const port = await (0, utils_1.findAvailablePort)();
            const proxy = await (0, utils_1.startCacheRegistryProxy)(workspace, port, cacheTagPrefix);
            (0, utils_1.configureGoCacheProgEnv)(proxy.port);
            core.saveState('proxyPid', proxy.pid.toString());
            core.saveState('proxyPort', proxy.port.toString());
            core.setOutput('gocacheprog-enabled', 'true');
            core.info('GOCACHEPROG proxy mode active');
        }
        else if (cacheBuild) {
            const goCacheDir = (0, utils_1.getGoCacheDir)();
            core.info('Restoring Go build cache from BoringCache...');
            const args = ['restore', workspace, `${buildTag}:${goCacheDir}`];
            if (verbose)
                args.push('--verbose');
            const result = await (0, utils_1.execBoringCache)(args);
            if ((0, utils_1.wasCacheHit)(result)) {
                core.info('Go build cache restored');
                buildRestored = true;
            }
            else {
                core.info('Go build cache not in cache');
            }
            core.saveState('buildTag', buildTag);
            core.saveState('buildRestored', buildRestored.toString());
            core.setOutput('gocacheprog-enabled', 'false');
        }
        const cacheHit = modulesRestored || buildRestored;
        core.setOutput('cache-hit', cacheHit.toString());
        core.info('Go setup complete');
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
    }
}
run();
