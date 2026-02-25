# boringcache/go-action

Setup Go via mise and cache Go + modules + build artifacts with BoringCache.

Installs Go via [mise](https://mise.jdx.dev/lang/go.html), restores cached directories before your job runs, and saves them when it finishes. Optionally enables GOCACHEPROG proxy mode (Go 1.24+) for per-object build cache dedup. Caches are content-addressed — identical content is never re-uploaded.

## Quick start

```yaml
- uses: boringcache/go-action@v1
  with:
    workspace: my-org/my-project
    go-version: '1.23'
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}

- run: go build ./...
- run: go test ./...
```

## Mental model

This action installs Go and caches the directories you explicitly choose.

- Go is installed via mise and cached for fast restoration on subsequent runs.
- Module cache (`GOMODCACHE`) is restored before your build.
- Build cache (`GOCACHE`) is restored to speed incremental compilation.
- Optional GOCACHEPROG proxy mode replaces build cache archiving with per-object CAS dedup.

Version detection order (when `go-version` is not specified):
- `go.mod` (go directive)
- `go.work`
- `.go-version`
- `.tool-versions` (asdf/mise format)
- `go env GOVERSION`

If no version is found, defaults to `1.23`.

Cache tags:
- Go installation: `{cache-tag}-go-{version}`
- Module cache: `{cache-tag}-go-modules`
- Build cache: `{cache-tag}-go-build-{major.minor}`

What gets cached:
- `~/.local/share/mise` (Go installation)
- `$GOMODCACHE` (or `~/go/pkg/mod`)
- `$GOCACHE` (or `~/.cache/go-build`)

## Common patterns

### Simple Go CI cache

```yaml
- uses: boringcache/go-action@v1
  with:
    workspace: my-org/my-project
    go-version: '1.23'
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}

- run: go build ./...
```

### GOCACHEPROG proxy mode (Go 1.24+)

For large projects, GOCACHEPROG proxy mode can be faster than archiving GOCACHE. Each build cache object is stored and retrieved individually through a cache-registry proxy.

```yaml
- uses: boringcache/go-action@v1
  with:
    workspace: my-org/my-project
    go-version: '1.25'
    gocacheprog: 'true'
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}

- run: go build ./...
```

When GOCACHEPROG is enabled, build cache archiving is automatically skipped (the proxy handles it). Module cache is still archived normally.

### Module cache only

```yaml
- uses: boringcache/go-action@v1
  with:
    workspace: my-org/my-project
    cache-build: 'false'
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}
```

### Example GitHub workflow

```yaml
name: Go Build (BoringCache)

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Go + Cache
        uses: boringcache/go-action@v1
        with:
          workspace: my-org/my-project
          go-version: '1.23'

      - name: Build
        run: go build ./...

      - name: Test
        run: go test ./...
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `cli-version` | No | `v1.7.2` | BoringCache CLI version. Set to `skip` to disable installation. |
| `workspace` | No | repo name | Workspace in `org/repo` form. Defaults to `BORINGCACHE_DEFAULT_WORKSPACE` or repo name. |
| `cache-tag` | No | repo name | Cache tag prefix used for go/module/build tags. |
| `go-version` | No | auto-detected | Go version to install via mise. |
| `working-directory` | No | `.` | Project working directory. |
| `cache-go` | No | `true` | Cache Go installation from mise. |
| `cache-modules` | No | `true` | Cache Go module cache (GOMODCACHE). |
| `cache-build` | No | `true` | Cache Go build cache (GOCACHE). Auto-disabled when `gocacheprog` is enabled. |
| `gocacheprog` | No | `false` | Enable GOCACHEPROG proxy mode (Go 1.24+). |
| `verbose` | No | `false` | Enable verbose CLI output. |
| `exclude` | No | - | Glob pattern to exclude from cache digest. |
| `save-always` | No | `false` | Save cache even if the job fails. |

## Outputs

| Output | Description |
|--------|-------------|
| `workspace` | Resolved workspace name |
| `go-version` | Installed Go version |
| `cache-tag` | Cache tag prefix used |
| `go-tag` | Cache tag for Go installation |
| `modules-tag` | Cache tag for module cache |
| `build-tag` | Cache tag for build cache |
| `cache-hit` | Whether any cache was restored |
| `go-cache-hit` | Whether the Go installation cache was restored |
| `gocacheprog-enabled` | Whether GOCACHEPROG proxy mode is active |

## Platform behavior

Platform scoping is what makes it safe to reuse caches across machines.

Module cache is platform-agnostic, but build cache artifacts are platform-specific. This action keeps platform scoping enabled by default.

## Environment variables

| Variable | Description |
|----------|-------------|
| `BORINGCACHE_API_TOKEN` | API token for BoringCache authentication |
| `BORINGCACHE_DEFAULT_WORKSPACE` | Default workspace if not specified in inputs |
| `BORINGCACHE_INSTALLER_URL` | Override URL for the BoringCache installer script |
| `BORINGCACHE_INSTALLER_SHA256` | Expected SHA256 of the installer script (recommended for integrity) |

## Troubleshooting

- Cache miss on first run is expected.
- GOCACHEPROG requires Go 1.24+. The action will error if you enable it with an older Go version.
- Go is installed via mise. If you need a specific Go version, use the `go-version` input.

## Release notes

See https://github.com/boringcache/go-action/releases.

## License

MIT
