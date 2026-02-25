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
        const workspace = core.getInput('workspace') || core.getState('workspace');
        const workingDir = core.getInput('working-directory') || core.getState('workingDir') || process.cwd();
        const cacheGo = core.getInput('cache-go') !== 'false' && core.getState('cacheGo') !== 'false';
        const cacheModules = core.getInput('cache-modules') !== 'false' && core.getState('cacheModules') !== 'false';
        const cacheBuild = core.getInput('cache-build') !== 'false' && core.getState('cacheBuild') !== 'false';
        const useGoCacheProg = core.getInput('gocacheprog') === 'true' || core.getState('useGoCacheProg') === 'true';
        const modulesTag = core.getState('modulesTag');
        const buildTag = core.getState('buildTag');
        const verbose = core.getState('verbose') === 'true';
        const exclude = core.getInput('exclude');
        const goVersion = core.getState('goVersion');
        const cacheTagPrefix = core.getState('cacheTagPrefix');
        if (!workspace) {
            core.info('No workspace found, skipping save');
            return;
        }
        core.info('Saving to BoringCache...');
        if (cacheGo && goVersion && cacheTagPrefix) {
            const miseDataDir = (0, utils_1.getMiseDataDir)();
            const goTag = `${cacheTagPrefix}-go-${goVersion}`;
            core.info(`Saving Go installation [${goTag}]...`);
            const args = ['save', workspace, `${goTag}:${miseDataDir}`];
            if (verbose)
                args.push('--verbose');
            await (0, utils_1.execBoringCache)(args);
        }
        if (cacheModules && modulesTag) {
            const goModCache = (0, utils_1.getGoModCache)();
            core.info(`Saving Go module cache [${modulesTag}]...`);
            const args = ['save', workspace, `${modulesTag}:${goModCache}`];
            if (verbose)
                args.push('--verbose');
            if (exclude)
                args.push('--exclude', exclude);
            await (0, utils_1.execBoringCache)(args);
        }
        if (useGoCacheProg) {
            const proxyPid = core.getState('proxyPid');
            if (proxyPid) {
                await (0, utils_1.stopCacheRegistryProxy)(parseInt(proxyPid, 10));
                core.info('GOCACHEPROG proxy stopped');
            }
        }
        else if (cacheBuild && buildTag) {
            const goCacheDir = (0, utils_1.getGoCacheDir)();
            core.info(`Saving Go build cache [${buildTag}]...`);
            const args = ['save', workspace, `${buildTag}:${goCacheDir}`];
            if (verbose)
                args.push('--verbose');
            if (exclude)
                args.push('--exclude', exclude);
            await (0, utils_1.execBoringCache)(args);
        }
        core.info('Save complete');
    }
    catch (error) {
        if (error instanceof Error) {
            core.warning(`Save failed: ${error.message}`);
        }
    }
}
run();
