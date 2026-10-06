# SL Lab — trustless checkout (dev environment)

Anchor/Solana workspace plus the dev container it's meant to run in. See
[`../planning/roadmap.md`](../planning/roadmap.md) for the actual escrow
design — this directory is just the environment and the first toolchain
checkpoint (`initialize_config`).

## Run it

### Option A — VS Code Dev Container (recommended)

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) (and Docker Desktop / Docker Engine if you don't have it).
2. Open this `src-ai` folder in VS Code.
3. When prompted, click **Reopen in Container** — or run `Dev Containers: Reopen in Container` from the Command Palette (`Cmd/Ctrl+Shift+P`).
4. First build takes a few minutes (pulls the Anchor base image, installs Node, Surfpool, zsh). Subsequent opens reuse the cached image.
5. Once the integrated terminal opens inside the container:
   ```
   npm install   # runs automatically via postCreateCommand, but safe to re-run
   anchor build
   anchor test
   ```

### Option B — plain Docker, no VS Code

```
docker build -t sl-lab .
docker run --rm -it -p 8899:8899 -v "$(pwd)":/workspaces/src-ai -w /workspaces/src-ai sl-lab
```

Then inside the container shell:

```
npm install
anchor build
anchor test
```

### Option C — GitHub Codespaces

Push this repo to GitHub, then **Code → Codespaces → Create codespace on main**.
Codespaces reads the same `.devcontainer/devcontainer.json` and builds the
identical environment in the browser — no local Docker needed.

## Shell aliases (inside the container)

Defined in `.devcontainer/zshrc`:

| Alias | Runs |
|---|---|
| `b`  | `anchor build` |
| `t`  | `anchor test` |
| `tb` | `anchor test --skip-build` |
| `tc` | `npx tsc --noEmit` |
| `sol` / `anc` / `sp` | `solana` / `anchor` / `surfpool` |

## What's here

```
Dockerfile                   # the toolchain image (Anchor, Rust, Node, Surfpool)
.devcontainer/                # VS Code / Codespaces config wrapping the Dockerfile
Anchor.toml                   # Anchor workspace config
programs/escrow/               # the on-chain program (Rust)
tests/escrow.ts                # Mocha/TS integration test
```

`programs/escrow/src/lib.rs` currently implements only `initialize_config` —
the roadmap's own first checkpoint, to prove the toolchain (build → deploy →
call) works before the real state machine (`place_order`, `pay_order`,
`confirm_delivery`, ...) goes on top of it.

## Known gap

The program ID in `declare_id!` (`programs/escrow/src/lib.rs`) and in
`Anchor.toml` is a placeholder — syntactically valid but not a real keypair.
The first `anchor build` generates the real one in `target/deploy/`; run
`anchor keys sync` immediately after to reconcile it everywhere, then rebuild.
