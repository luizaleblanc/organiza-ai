# Imagem do backend Kof (monolito KofLith, backend/*.kf) para o Render.
#
# Build:  docker build -t organiza-ai-backend .                                              (Kof mais recente)
#         docker build --build-arg KOF_TAG=kof-0.5.0-beta-linux-x86_64 -t organiza-ai-backend .   (versao fixa)
# Run:    docker run -p 8080:8080 -e KOF_JWT_SECRET=<64 hex> organiza-ai-backend
# Nenhum segredo entra na imagem: KOF_JWT_SECRET (obrigatoria), KOF_JWT_ISSUER, KOF_JWT_AUDIENCE e PORT
# chegam so como variaveis de ambiente no runtime (ver docs/DEPLOY.md).

# ---------------------------------------------------------------------------
# Build stage: baixa o release Linux do Kof (o mais recente, ou KOF_TAG), confere o SHA256
# publicado no proprio release e compila o backend para a JVM.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS build
# KOF_TAG vazio = release Linux mais recente; preenchido = versao fixa (ex.: kof-0.5.0-beta-linux-x86_64)
ARG KOF_TAG=
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl jq \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt
RUN set -eu; \
    tag="$KOF_TAG"; \
    if [ -z "$tag" ]; then \
      tag="$(curl -fsSL 'https://api.github.com/repos/KofLang/Kof4j/releases?per_page=50' \
        | jq -r '[.[] | select(.tag_name | test("linux-x86_64$")) | select(.draft | not)] | sort_by(.published_at) | last | .tag_name')"; \
    fi; \
    case "$tag" in *linux-x86_64) ;; *) echo "KOF_TAG invalido ou nao resolvido: '$tag'" >&2; exit 1 ;; esac; \
    echo "Kof release: $tag (KOF_TAG='${KOF_TAG}')"; \
    base="https://github.com/KofLang/Kof4j/releases/download/$tag"; \
    curl -fsSLO "$base/SHA256SUMS"; \
    tarball="$(awk '/linux-x86_64\.tar\.gz$/ {print $2}' SHA256SUMS)"; \
    test -n "$tarball"; \
    curl -fsSLO "$base/$tarball"; \
    grep " $tarball\$" SHA256SUMS | sha256sum -c -; \
    mkdir -p /opt/kof; \
    tar -xzf "$tarball" -C /opt/kof --strip-components=1; \
    rm -f "$tarball"; \
    /opt/kof/bin/kof version

WORKDIR /src
COPY kof.toml ./
COPY backend ./backend
RUN /opt/kof/bin/kof check backend \
 && /opt/kof/bin/kof build backend --target jvm --output /out/classes

# ---------------------------------------------------------------------------
# Run stage: JRE 25. As classes geradas do projeto sao V21 (major 65), mas o runtime do Kof
# copiado junto (dev/kof/runtime/*) e compilado pelo JDK 25 do pacote (major 69):
# num JRE 21 o boot morre com UnsupportedClassVersionError.
# Execucao identica ao `kof run` (kof-cli CmdRun): java -Dkof.root=... -cp <classes> Default.Main
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jre
RUN useradd --system --uid 10001 --home-dir /app kof
WORKDIR /app
COPY --from=build --chown=kof:kof /out/classes /app/classes
USER kof
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["java", "-Dkof.root=/app", "-cp", "/app/classes", "Default.Main"]
