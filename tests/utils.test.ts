import { getWorkspace, getCacheTagPrefix, wasCacheHit, getGoMajorMinor, getGoModCache, getGoCacheDir, validateGoVersion, getMiseBinPath, getMiseDataDir } from '../lib/utils';
import * as core from '@actions/core';
import * as path from 'path';
import * as os from 'os';

describe('Go Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BORINGCACHE_DEFAULT_WORKSPACE;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GOMODCACHE;
    delete process.env.GOPATH;
    delete process.env.GOCACHE;
    delete process.env.LocalAppData;
  });

  describe('getWorkspace', () => {
    it('should return input workspace when provided', () => {
      expect(getWorkspace('my-org/my-project')).toBe('my-org/my-project');
    });

    it('should use BORINGCACHE_DEFAULT_WORKSPACE as fallback', () => {
      process.env.BORINGCACHE_DEFAULT_WORKSPACE = 'default-org/default-project';
      expect(getWorkspace('')).toBe('default-org/default-project');
    });

    it('should add default/ prefix when no slash present', () => {
      expect(getWorkspace('my-project')).toBe('default/my-project');
    });

    it('should fail when no workspace available', () => {
      expect(() => getWorkspace('')).toThrow('Workspace required');
      expect(core.setFailed).toHaveBeenCalled();
    });
  });

  describe('getCacheTagPrefix', () => {
    it('should return input cache tag when provided', () => {
      expect(getCacheTagPrefix('my-cache')).toBe('my-cache');
    });

    it('should use repository name as default', () => {
      process.env.GITHUB_REPOSITORY = 'owner/my-repo';
      expect(getCacheTagPrefix('')).toBe('my-repo');
    });

    it('should return go as final fallback', () => {
      expect(getCacheTagPrefix('')).toBe('go');
    });
  });

  describe('wasCacheHit', () => {
    it('should return false for non-zero exit code', () => {
      expect(wasCacheHit(1)).toBe(false);
    });

    it('should return true for zero exit code with no output', () => {
      expect(wasCacheHit(0)).toBe(true);
    });
  });

  describe('getGoMajorMinor', () => {
    it('should extract major.minor from full version', () => {
      expect(getGoMajorMinor('1.23.4')).toBe('1.23');
    });

    it('should handle major.minor only', () => {
      expect(getGoMajorMinor('1.24')).toBe('1.24');
    });

    it('should return original if no match', () => {
      expect(getGoMajorMinor('stable')).toBe('stable');
    });
  });

  describe('getGoModCache', () => {
    it('should return GOMODCACHE when set', () => {
      process.env.GOMODCACHE = '/custom/mod/cache';
      expect(getGoModCache()).toBe('/custom/mod/cache');
    });

    it('should use GOPATH fallback', () => {
      process.env.GOPATH = '/custom/gopath';
      expect(getGoModCache()).toBe(path.join('/custom/gopath', 'pkg', 'mod'));
    });

    it('should use default GOPATH', () => {
      expect(getGoModCache()).toBe(path.join(os.homedir(), 'go', 'pkg', 'mod'));
    });
  });

  describe('getGoCacheDir', () => {
    it('should return GOCACHE when set', () => {
      process.env.GOCACHE = '/custom/go-build';
      expect(getGoCacheDir()).toBe('/custom/go-build');
    });

    it('should return platform-specific default on linux', () => {
      if (os.platform() === 'linux') {
        expect(getGoCacheDir()).toBe(path.join(os.homedir(), '.cache', 'go-build'));
      }
    });
  });

  describe('validateGoVersion', () => {
    it('should pass for Go 1.24+ with GOCACHEPROG', async () => {
      await expect(validateGoVersion('1.24', true)).resolves.not.toThrow();
      await expect(validateGoVersion('1.25.1', true)).resolves.not.toThrow();
    });

    it('should reject Go < 1.24 with GOCACHEPROG', async () => {
      await expect(validateGoVersion('1.23', true)).rejects.toThrow('GOCACHEPROG requires Go 1.24+');
      await expect(validateGoVersion('1.22.5', true)).rejects.toThrow('GOCACHEPROG requires Go 1.24+');
    });

    it('should skip validation when GOCACHEPROG not needed', async () => {
      await expect(validateGoVersion('1.21', false)).resolves.not.toThrow();
    });
  });

  describe('getMiseBinPath', () => {
    it('should return path under .local/bin', () => {
      const result = getMiseBinPath();
      expect(result).toContain(path.join('.local', 'bin', 'mise'));
    });
  });

  describe('getMiseDataDir', () => {
    it('should return path under .local/share/mise on unix', () => {
      if (process.platform !== 'win32') {
        const result = getMiseDataDir();
        expect(result).toBe(path.join(os.homedir(), '.local', 'share', 'mise'));
      }
    });
  });
});
