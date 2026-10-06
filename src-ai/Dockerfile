# Reproducible Anchor/Solana environment for the trustless-checkout program.
#
#   docker build -t sl-lab .
#   docker run --rm -it sl-lab                      # anchor test
#
# Base is OtterSec's verified-build image, which already carries the exact
# anchor-cli this workspace targets plus a matching Solana toolchain. Only
# Node 24 and Surfpool (the local validator `anchor test` needs) are added
# here. Mirrors the Superteam Poland bootcamp devcontainer referenced in
# planning/criteria.md so the toolchain matches what mentors/judges expect.

FROM quay.io/ottersec/anchor:v1.1.2 AS toolchain

ENV NODE_VERSION=24 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        wget \
        git \
        jq \
        ripgrep \
        htop \
        tmux \
        tree \
        build-essential \
        pkg-config \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# The base ships Node via nvm; installing over the top and putting /usr/bin
# first shadows the nvm copy so `node`/`npm` resolve to a current release.
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm typescript ts-mocha

ENV PATH=/usr/bin:$PATH

# Anchor's default local validator — `anchor test` cannot start without it.
RUN curl -sL https://run.surfpool.run/ | bash
ENV PATH=/root/.local/bin:$PATH

# The Anchor provider needs a wallet keypair; it holds no real funds.
RUN test -f /root/.config/solana/id.json \
    || solana-keygen new --no-bip39-passphrase --silent --outfile /root/.config/solana/id.json

# A usable interactive shell — the container is meant to be worked in, not
# just run once.
RUN apt-get update && apt-get install -y --no-install-recommends \
        zsh \
        less \
        locales \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i 's/^# en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen

ENV LANG=en_US.UTF-8 \
    SHELL=/usr/bin/zsh \
    TERM=xterm-256color

RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended \
    && git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions \
        "$HOME/.oh-my-zsh/custom/plugins/zsh-autosuggestions" \
    && git clone --depth 1 https://github.com/zsh-users/zsh-syntax-highlighting \
        "$HOME/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting" \
    && chsh -s /usr/bin/zsh root

COPY .devcontainer/zshrc /root/.zshrc

# Surfpool's RPC port, forwarded by devcontainer.json too.
EXPOSE 8899

CMD ["zsh"]
