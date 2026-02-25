import * as core from '@actions/core';
import { execBoringCache, getGoModCache, getGoCacheDir, getMiseDataDir, stopCacheRegistryProxy } from './utils';

async function run(): Promise<void> {
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
      const miseDataDir = getMiseDataDir();
      const goTag = `${cacheTagPrefix}-go-${goVersion}`;
      core.info(`Saving Go installation [${goTag}]...`);
      const args = ['save', workspace, `${goTag}:${miseDataDir}`];
      if (verbose) args.push('--verbose');
      await execBoringCache(args);
    }

    if (cacheModules && modulesTag) {
      const goModCache = getGoModCache();
      core.info(`Saving Go module cache [${modulesTag}]...`);
      const args = ['save', workspace, `${modulesTag}:${goModCache}`];
      if (verbose) args.push('--verbose');
      if (exclude) args.push('--exclude', exclude);
      await execBoringCache(args);
    }

    if (useGoCacheProg) {
      const proxyPid = core.getState('proxyPid');
      if (proxyPid) {
        await stopCacheRegistryProxy(parseInt(proxyPid, 10));
        core.info('GOCACHEPROG proxy stopped');
      }
    } else if (cacheBuild && buildTag) {
      const goCacheDir = getGoCacheDir();
      core.info(`Saving Go build cache [${buildTag}]...`);
      const args = ['save', workspace, `${buildTag}:${goCacheDir}`];
      if (verbose) args.push('--verbose');
      if (exclude) args.push('--exclude', exclude);
      await execBoringCache(args);
    }

    core.info('Save complete');
  } catch (error) {
    if (error instanceof Error) {
      core.warning(`Save failed: ${error.message}`);
    }
  }
}

run();
