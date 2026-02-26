import * as core from '@actions/core';
import * as execModule from '@actions/exec';

jest.mock('@boringcache/action-core', () => ({
  ensureBoringCache: jest.fn().mockResolvedValue(undefined),
  execBoringCache: jest.fn().mockResolvedValue(0),
  getWorkspace: jest.fn((input: string) => {
    if (!input) throw new Error('Workspace required');
    if (!input.includes('/')) return `default/${input}`;
    return input;
  }),
  getCacheTagPrefix: jest.fn((input: string, fallback: string) => {
    if (input) return input;
    const repo = process.env.GITHUB_REPOSITORY || '';
    if (repo) return repo.split('/')[1] || repo;
    return fallback;
  }),
  pathExists: jest.fn().mockResolvedValue(false),
  startRegistryProxy: jest.fn().mockResolvedValue({ pid: 12345, port: 5000 }),
  waitForProxy: jest.fn().mockResolvedValue(undefined),
  stopRegistryProxy: jest.fn().mockResolvedValue(undefined),
  findAvailablePort: jest.fn().mockResolvedValue(9876),
}));

jest.mock('@actions/exec', () => ({
  exec: jest.fn().mockResolvedValue(0),
}));

import {
  ensureBoringCache,
  execBoringCache,
  startRegistryProxy,
  waitForProxy,
  stopRegistryProxy,
  findAvailablePort,
} from '@boringcache/action-core';

describe('Go restore/save round-trip', () => {
  const stateStore: Record<string, string> = {};
  const outputs: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(stateStore).forEach(k => delete stateStore[k]);
    Object.keys(outputs).forEach(k => delete outputs[k]);

    (ensureBoringCache as jest.Mock).mockResolvedValue(undefined);
    (execBoringCache as jest.Mock).mockResolvedValue(0);
    (startRegistryProxy as jest.Mock).mockResolvedValue({ pid: 12345, port: 5000 });
    (waitForProxy as jest.Mock).mockResolvedValue(undefined);
    (stopRegistryProxy as jest.Mock).mockResolvedValue(undefined);
    (findAvailablePort as jest.Mock).mockResolvedValue(9876);

    const { getWorkspace, getCacheTagPrefix } = require('@boringcache/action-core');
    (getWorkspace as jest.Mock).mockImplementation((input: string) => {
      if (!input) throw new Error('Workspace required');
      if (!input.includes('/')) return `default/${input}`;
      return input;
    });
    (getCacheTagPrefix as jest.Mock).mockImplementation((input: string, fallback: string) => {
      if (input) return input;
      const repo = process.env.GITHUB_REPOSITORY || '';
      if (repo) return repo.split('/')[1] || repo;
      return fallback;
    });

    (core.saveState as jest.Mock).mockImplementation((key: string, value: string) => {
      stateStore[key] = value;
    });
    (core.getState as jest.Mock).mockImplementation((key: string) => {
      return stateStore[key] || '';
    });
    (core.setOutput as jest.Mock).mockImplementation((key: string, value: string) => {
      outputs[key] = value;
    });

    process.env.BORINGCACHE_API_TOKEN = 'test-token';
    process.env.GITHUB_REPOSITORY = 'myorg/myrepo';
  });

  afterEach(() => {
    delete process.env.BORINGCACHE_API_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GOCACHEPROG;
  });

  it('full round-trip: restore go+modules+build, save go+modules+build', async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'cli-version': 'v1.9.0',
        'workspace': 'myorg/myproject',
        'cache-tag': '',
        'go-version': '1.23',
        'working-directory': '.',
        'cache-go': 'true',
        'cache-modules': 'true',
        'cache-build': 'true',
        'gocacheprog': 'false',
        'verbose': 'false',
      };
      return inputs[name] || '';
    });

    jest.isolateModules(() => {
      require('../lib/restore');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(ensureBoringCache).toHaveBeenCalledWith({ version: 'v1.9.0' });

    expect(execBoringCache).toHaveBeenCalledTimes(3);
    expect(execBoringCache).toHaveBeenCalledWith(
      expect.arrayContaining(['restore', 'myorg/myproject', expect.stringContaining('myrepo-go-1.23:')]),
      expect.anything()
    );
    expect(execBoringCache).toHaveBeenCalledWith(
      expect.arrayContaining(['restore', 'myorg/myproject', expect.stringContaining('myrepo-go-modules:')]),
      expect.anything()
    );
    expect(execBoringCache).toHaveBeenCalledWith(
      expect.arrayContaining(['restore', 'myorg/myproject', expect.stringContaining('myrepo-go-build-1.23:')]),
      expect.anything()
    );

    expect(execModule.exec).toHaveBeenCalledWith('sh', ['-c', 'curl https://mise.run | sh']);
    expect(execModule.exec).toHaveBeenCalledWith(
      expect.stringContaining('mise'),
      ['use', '-g', 'go@1.23']
    );

    expect(stateStore['workspace']).toBe('myorg/myproject');
    expect(stateStore['cacheTagPrefix']).toBe('myrepo');
    expect(stateStore['goVersion']).toBe('1.23');
    expect(stateStore['cacheGo']).toBe('true');
    expect(stateStore['cacheModules']).toBe('true');
    expect(stateStore['cacheBuild']).toBe('true');
    expect(stateStore['useGoCacheProg']).toBe('false');

    expect(outputs['workspace']).toBe('myorg/myproject');
    expect(outputs['go-version']).toBe('1.23');
    expect(outputs['modules-tag']).toBe('myrepo-go-modules');
    expect(outputs['build-tag']).toBe('myrepo-go-build-1.23');
    expect(outputs['go-cache-hit']).toBe('true');

    (execBoringCache as jest.Mock).mockClear();

    jest.isolateModules(() => {
      const coreMock = require('@actions/core');
      coreMock.getState.mockImplementation((key: string) => stateStore[key] || '');
      coreMock.getInput.mockImplementation((name: string) => {
        if (name === 'workspace') return 'myorg/myproject';
        return '';
      });
      require('../lib/save');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(execBoringCache).toHaveBeenCalledTimes(3);
    expect(execBoringCache).toHaveBeenCalledWith(
      expect.arrayContaining(['save', 'myorg/myproject', expect.stringContaining('myrepo-go-1.23:')]),
      expect.anything()
    );
    expect(execBoringCache).toHaveBeenCalledWith(
      expect.arrayContaining(['save', 'myorg/myproject', expect.stringContaining('myrepo-go-modules:')]),
      expect.anything()
    );
    expect(execBoringCache).toHaveBeenCalledWith(
      expect.arrayContaining(['save', 'myorg/myproject', expect.stringContaining('myrepo-go-build-1.23:')]),
      expect.anything()
    );
  });

  it('gocacheprog proxy mode: starts proxy, sets GOCACHEPROG, stops on save', async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'cli-version': 'v1.9.0',
        'workspace': 'myorg/myproject',
        'cache-tag': '',
        'go-version': '1.25',
        'working-directory': '.',
        'cache-go': 'true',
        'cache-modules': 'true',
        'cache-build': 'true',
        'gocacheprog': 'true',
        'verbose': 'false',
      };
      return inputs[name] || '';
    });

    jest.isolateModules(() => {
      require('../lib/restore');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(findAvailablePort).toHaveBeenCalled();
    expect(startRegistryProxy).toHaveBeenCalledWith(expect.objectContaining({
      command: 'cache-registry',
      workspace: 'myorg/myproject',
      tag: 'myrepo',
      host: '127.0.0.1',
      port: 9876,
      noPlatform: true,
      noGit: true,
    }));
    expect(waitForProxy).toHaveBeenCalledWith(5000, 30000, 12345);

    expect(core.exportVariable).toHaveBeenCalledWith(
      'GOCACHEPROG',
      'boringcache go-cacheprog --endpoint http://127.0.0.1:5000'
    );

    expect(stateStore['proxyPid']).toBe('12345');
    expect(stateStore['proxyPort']).toBe('5000');
    expect(stateStore['useGoCacheProg']).toBe('true');

    expect(execBoringCache).toHaveBeenCalledWith(
      expect.arrayContaining(['restore', 'myorg/myproject', expect.stringContaining('myrepo-go-modules:')]),
      expect.anything()
    );

    const restoreCalls = (execBoringCache as jest.Mock).mock.calls;
    const buildCacheCall = restoreCalls.find((call: string[][]) =>
      call[0].some((arg: string) => arg.includes('go-build'))
    );
    expect(buildCacheCall).toBeUndefined();

    expect(outputs['gocacheprog-enabled']).toBe('true');

    jest.isolateModules(() => {
      const coreMock = require('@actions/core');
      coreMock.getState.mockImplementation((key: string) => stateStore[key] || '');
      coreMock.getInput.mockImplementation((name: string) => {
        if (name === 'workspace') return 'myorg/myproject';
        if (name === 'gocacheprog') return 'true';
        return '';
      });
      require('../lib/save');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(stopRegistryProxy).toHaveBeenCalledWith(12345);
  });

  it('skips CLI install when cli-version is "skip"', async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'cli-version': 'skip',
        'workspace': 'myorg/myproject',
        'go-version': '1.23',
      };
      return inputs[name] || '';
    });

    jest.isolateModules(() => {
      require('../lib/restore');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(ensureBoringCache).not.toHaveBeenCalled();
    expect(execBoringCache).toHaveBeenCalled();
  });

  it('save is a no-op when workspace is missing', async () => {
    (core.getState as jest.Mock).mockImplementation(() => '');
    (core.getInput as jest.Mock).mockImplementation(() => '');

    jest.isolateModules(() => {
      require('../lib/save');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(execBoringCache).not.toHaveBeenCalled();
    expect(stopRegistryProxy).not.toHaveBeenCalled();
  });

  it('custom cache-tag is used', async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'workspace': 'myorg/myproject',
        'cache-tag': 'my-custom-tag',
        'go-version': '1.24',
      };
      return inputs[name] || '';
    });

    jest.isolateModules(() => {
      require('../lib/restore');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(outputs['cache-tag']).toBe('my-custom-tag');
    expect(outputs['modules-tag']).toBe('my-custom-tag-go-modules');
    expect(outputs['build-tag']).toBe('my-custom-tag-go-build-1.24');
  });

  it('disable cache-modules only caches build', async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'workspace': 'myorg/myproject',
        'go-version': '1.23',
        'cache-modules': 'false',
        'cache-build': 'true',
      };
      return inputs[name] || '';
    });

    jest.isolateModules(() => {
      require('../lib/restore');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    const calls = (execBoringCache as jest.Mock).mock.calls;
    const modulesCalls = calls.filter((call: string[][]) =>
      call[0].some((arg: string) => arg.includes('go-modules'))
    );
    expect(modulesCalls).toHaveLength(0);

    expect(execBoringCache).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('go-build')]),
      expect.anything()
    );
  });

  it('disable cache-build only caches modules', async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'workspace': 'myorg/myproject',
        'go-version': '1.23',
        'cache-modules': 'true',
        'cache-build': 'false',
      };
      return inputs[name] || '';
    });

    jest.isolateModules(() => {
      require('../lib/restore');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    const calls = (execBoringCache as jest.Mock).mock.calls;
    const buildCalls = calls.filter((call: string[][]) =>
      call[0].some((arg: string) => arg.includes('go-build'))
    );
    expect(buildCalls).toHaveLength(0);

    expect(execBoringCache).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('go-modules')]),
      expect.anything()
    );
  });

  it('rejects gocacheprog with Go < 1.24', async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'workspace': 'myorg/myproject',
        'go-version': '1.23',
        'gocacheprog': 'true',
      };
      return inputs[name] || '';
    });

    jest.isolateModules(() => {
      require('../lib/restore');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('GOCACHEPROG requires Go 1.24+')
    );
  });

  it('cache-go false skips Go cache restore and save', async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'workspace': 'myorg/myproject',
        'go-version': '1.23',
        'cache-go': 'false',
        'cache-modules': 'true',
        'cache-build': 'true',
      };
      return inputs[name] || '';
    });

    jest.isolateModules(() => {
      require('../lib/restore');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    const restoreCalls = (execBoringCache as jest.Mock).mock.calls;
    const goCacheCalls = restoreCalls.filter((call: string[][]) =>
      call[0].some((arg: string) => arg.match(/myrepo-go-1\.23:/))
    );
    expect(goCacheCalls).toHaveLength(0);

    expect(execModule.exec).toHaveBeenCalledWith(
      expect.stringContaining('mise'),
      ['install', 'go@1.23']
    );

    expect(stateStore['cacheGo']).toBe('false');

    (execBoringCache as jest.Mock).mockClear();

    jest.isolateModules(() => {
      const coreMock = require('@actions/core');
      coreMock.getState.mockImplementation((key: string) => stateStore[key] || '');
      coreMock.getInput.mockImplementation((name: string) => {
        if (name === 'workspace') return 'myorg/myproject';
        if (name === 'cache-go') return 'false';
        return '';
      });
      require('../lib/save');
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    const saveCalls = (execBoringCache as jest.Mock).mock.calls;
    const goSaveCalls = saveCalls.filter((call: string[][]) =>
      call[0].some((arg: string) => arg.match(/myrepo-go-1\.23:/))
    );
    expect(goSaveCalls).toHaveLength(0);
  });
});
