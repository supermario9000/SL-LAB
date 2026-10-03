# Chaind Logistics

The chronicles of SL lab - the mightiest Lithuanian team from Vilnius University.

Currently at: HackYeah.pl

Devcontainer environment for the Superteam Poland Solana Bootcamp.

## Opening work enviroment

### VS Code
1. Open this repository in VS Code.
2. When prompted, click **Reopen in Container** (or run `Dev Containers: Reopen in Container` from the Command Palette).
3. The devcontainer includes the full pre-installed Solana toolchain:
   - **Node.js**: 24+
   - **Rust**: 1.95.0
   - **Anchor**: 1.1.2
   - **Surfpool**: local validator
   - **zsh**: configured with autosuggestions and syntax highlighting

### Terminal
```bash
sudo docker build -t chaind_logistics-image .
sudo docker run --rm --interactive --tty --name chaind_logistics-container -v "$(pwd)/logictics/":/workspace -w /workspace chaind_logistics-image
```
