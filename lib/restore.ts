import * as core from '@actions/core';
import {
  ensureBoringCache,
  execBoringCache,
  getWorkspace,
  getCacheTagPrefix,
  getGoVersion,
  getGoMajorMinor,
  getMiseDataDir,
  installMise,
  installGo,
  activateGo,
  configureGoEnv,
  getGoModCache,
  getGoCacheDir,
  wasCacheHit,
  validateGoVersion,
  findAvailablePort,
  startCacheRegistryProxy,
  configureGoCacheProgEnv,
} from './utils';

async function run(): Promise<void> {
  try {
    const workspace = getWorkspace(core.getInput('workspace'));
    const cacheTagPrefix = getCacheTagPrefix(core.getInput('cache-tag'));
    const inputVersion = core.getInput('go-version');
    const workingDir = core.getInput('working-directory') || process.cwd();
    const cacheGo = core.getInput('cache-go') !== 'false';
    const cacheModules = core.getInput('cache-modules') !== 'false';
    const cacheBuild = core.getInput('cache-build') !== 'false';
    const useGoCacheProg = core.getInput('gocacheprog') === 'true';
    const verbose = core.getInput('verbose') === 'true';
    const cliVersion = core.getInput('cli-version');

    const goVersion = await getGoVersion(inputVersion, workingDir);
    const goMajorMinor = getGoMajorMinor(goVersion);

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
      await ensureBoringCache({ version: cliVersion });
    }

    const miseDataDir = getMiseDataDir();
    const goTag = `${cacheTagPrefix}-go-${goVersion}`;

    let goCacheHit = false;
    if (cacheGo) {
      core.info(`Restoring Go ${goVersion}...`);
      const goArgs = ['restore', workspace, `${goTag}:${miseDataDir}`];
      if (verbose) goArgs.push('--verbose');
      const goResult = await execBoringCache(goArgs);
      goCacheHit = wasCacheHit(goResult);
      core.setOutput('go-cache-hit', goCacheHit.toString());
    }

    await installMise();

    if (goCacheHit) {
      await activateGo(goVersion);
    } else {
      await installGo(goVersion);
    }

    configureGoEnv();

    await validateGoVersion(goVersion, useGoCacheProg);

    const modulesTag = `${cacheTagPrefix}-go-modules`;
    const buildTag = `${cacheTagPrefix}-go-build-${goMajorMinor}`;

    core.setOutput('workspace', workspace);
    core.setOutput('go-version', goVersion);
    core.setOutput('cache-tag', cacheTagPrefix);
    core.setOutput('modules-tag', modulesTag);
    core.setOutput('build-tag', buildTag);

    let modulesRestored = false;
    if (cacheModules) {
      const goModCache = getGoModCache();

      core.info('Restoring Go module cache from BoringCache...');
      const args = ['restore', workspace, `${modulesTag}:${goModCache}`];
      if (verbose) args.push('--verbose');
      const result = await execBoringCache(args);
      if (wasCacheHit(result)) {
        core.info('Go module cache restored');
        modulesRestored = true;
      } else {
        core.info('Go module cache not in cache');
      }

      core.saveState('modulesTag', modulesTag);
      core.saveState('modulesRestored', modulesRestored.toString());
    }

    let buildRestored = false;
    if (useGoCacheProg) {
      const port = await findAvailablePort();
      const proxy = await startCacheRegistryProxy(workspace, port, cacheTagPrefix);
      configureGoCacheProgEnv(proxy.port);

      core.saveState('proxyPid', proxy.pid.toString());
      core.saveState('proxyPort', proxy.port.toString());

      core.setOutput('gocacheprog-enabled', 'true');
      core.info('GOCACHEPROG proxy mode active');
    } else if (cacheBuild) {
      const goCacheDir = getGoCacheDir();

      core.info('Restoring Go build cache from BoringCache...');
      const args = ['restore', workspace, `${buildTag}:${goCacheDir}`];
      if (verbose) args.push('--verbose');
      const result = await execBoringCache(args);
      if (wasCacheHit(result)) {
        core.info('Go build cache restored');
        buildRestored = true;
      } else {
        core.info('Go build cache not in cache');
      }

      core.saveState('buildTag', buildTag);
      core.saveState('buildRestored', buildRestored.toString());
      core.setOutput('gocacheprog-enabled', 'false');
    }

    const cacheHit = modulesRestored || buildRestored;
    core.setOutput('cache-hit', cacheHit.toString());

    core.info('Go setup complete');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
