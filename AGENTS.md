# BoringCache Go

## What It Does

Installs Go via mise and caches Go + module + build artifacts with BoringCache:
- Go installation (`~/.local/share/mise`)
- Module cache (`GOMODCACHE` / `~/go/pkg/mod`)
- Build cache (`GOCACHE` / `~/.cache/go-build`)
- Optional GOCACHEPROG proxy mode (Go 1.24+) for per-object CAS dedup

## Quick Reference

```yaml
- uses: boringcache/go-action@v1
  with:
    workspace: my-org/my-project
    go-version: '1.23'
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}
```

## How It Works

1. **Restore phase**:
   - Installs BoringCache CLI
   - Restores Go installation cache (mise data dir)
   - Installs mise, then activates (cache hit) or installs (miss) Go
   - Configures Go environment (GOPATH, PATH)
   - Restores module cache (version-agnostic)
   - Restores build cache (version-specific) OR starts GOCACHEPROG proxy

2. **Save phase**:
   - Saves Go installation cache
   - Saves module cache
   - Saves build cache OR stops GOCACHEPROG proxy

## Cache Tags

Uses `cache-tag` prefix (defaults to repository name) with suffixes:
- `{prefix}-go-{version}` — Go installation (version-specific)
- `{prefix}-go-modules` — Module cache (version-agnostic)
- `{prefix}-go-build-{major.minor}` — Build cache (version-specific)

## GOCACHEPROG Proxy Mode

When `gocacheprog: true` (requires Go 1.24+):
- Starts a cache-registry proxy
- Sets `GOCACHEPROG="boringcache go-cacheprog --endpoint http://127.0.0.1:PORT"`
- Go's build cache is handled per-object through the proxy (no archive save/restore)
- Module cache is still archived normally

## Version Detection

Auto-detects version from (in order):
1. `go-version` input
2. `go.mod`
3. `go.work`
4. `.go-version`
5. `.tool-versions`
6. `go env GOVERSION`

## Inputs

| Input | Description |
|-------|-------------|
| `workspace` | BoringCache workspace |
| `go-version` | Go version to install via mise |
| `cache-tag` | Cache tag prefix (defaults to repo name) |
| `cache-go` | Cache Go installation (default: true) |
| `cache-modules` | Cache GOMODCACHE (default: true) |
| `cache-build` | Cache GOCACHE archive (default: true) |
| `gocacheprog` | Enable GOCACHEPROG proxy (default: false) |

## Outputs

| Output | Description |
|--------|-------------|
| `cache-hit` | `true` if cache was restored |
| `go-cache-hit` | `true` if Go installation was restored |
| `go-version` | Installed Go version |
| `modules-tag` | Cache tag for module cache |
| `build-tag` | Cache tag for build cache |
| `gocacheprog-enabled` | Whether GOCACHEPROG proxy is active |

## Code Structure

- `lib/restore.ts` — Install Go via mise, restore caches, optionally start GOCACHEPROG proxy
- `lib/save.ts` — Save caches, stop proxy
- `lib/utils.ts` — Shared utilities, mise helpers, version detection, Go env helpers

## Build

```bash
npm install && npm run build && npm test
```

---
**See [../AGENTS.md](../AGENTS.md) for shared conventions.**
