# Imagem do backend Kof (monolito KofLith, backend/*.kf) para o Render.
#
# Build:  docker build -t organiza-ai-backend .                                     (versao fixa do arquivo KOF_VERSION)
#         docker build --build-arg KOF_TAG=kof-0.6.3-linux-x86_64 -t organiza-ai-backend .   (outra versao estavel)
#         docker build --build-arg KOF_TAG=latest -t organiza-ai-backend .              (estavel mais recente; so para testar troca)
# Run:    docker run -p 8080:8080 -e KOF_JWT_SECRET=<64 hex> -e KOF_DB_URL=<url sem credenciais> \
#           -e KOF_DB_USER=... -e KOF_DB_PASSWORD=... organiza-ai-backend
# Nenhum segredo entra na imagem: KOF_JWT_SECRET (obrigatoria), KOF_DB_*, KOF_JWT_ISSUER, KOF_JWT_AUDIENCE e PORT
# chegam so como variaveis de ambiente no runtime (ver docs/DEPLOY.md).

# ---------------------------------------------------------------------------
# Build stage: baixa o release Linux do Kof fixado em KOF_VERSION (ou KOF_TAG), recusa prerelease,
# confere o SHA256 publicado no proprio release e compila o backend para a JVM.
# Trocar a versao = editar KOF_VERSION num commit proprio, depois de todos os gates (ver handoff 2.1).
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS build
# KOF_TAG vazio = versao do arquivo KOF_VERSION; "latest" = estavel mais recente; senao, o tag exato
ARG KOF_TAG=
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl jq unzip zip \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt
COPY KOF_VERSION /opt/KOF_VERSION
RUN set -eu; \
    tag="$KOF_TAG"; \
    if [ -z "$tag" ]; then tag="$(tr -d '[:space:]' < /opt/KOF_VERSION)-linux-x86_64"; fi; \
    if [ "$tag" = latest ]; then \
      tag="$(curl -fsSL 'https://api.github.com/repos/KofLang/Kof4j/releases?per_page=50' \
        | jq -r '[.[] | select(.tag_name | test("linux-x86_64$")) | select((.draft or .prerelease) | not)] | sort_by(.published_at) | last | .tag_name')"; \
    fi; \
    case "$tag" in *linux-x86_64) ;; *) echo "KOF_TAG invalido ou nao resolvido: '$tag'" >&2; exit 1 ;; esac; \
    pre="$(curl -fsSL "https://api.github.com/repos/KofLang/Kof4j/releases/tags/$tag" | jq -r '.prerelease')"; \
    if [ "$pre" != false ]; then echo "Kof $tag recusado: prerelease ou inexistente (prerelease=$pre)" >&2; exit 1; fi; \
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
COPY kof.toml kofdeps ./
COPY backend ./backend
# O `kof build` nao copia o driver JDBC e so auto-provisiona URL literal em db.connect (medido no 0.6.3 e no 0.6.5);
# a URL vem de KOF_DB_URL, entao os drivers ficam fixados em `kofdeps` e entram no fat jar via --classpath.
# O `--fat` (0.6.3 e 0.6.5) guarda so o primeiro META-INF/services/java.sql.Driver (o do H2): sem o do MariaDB,
# mysql:// falha com "driver ausente" (medido). O arquivo e refeito com os drivers de todos os jars.
RUN /opt/kof/bin/kof check backend \
 && cp="$(/opt/kof/bin/kof deps resolve . | tail -1)" \
 && echo "drivers: $cp" \
 && /opt/kof/bin/kof build backend --target jvm --fat --classpath "$cp" --output /out/app \
 && test -f /out/app/kof-app.jar \
 && mkdir -p /tmp/svc/META-INF/services \
 && for j in $(echo "$cp" | tr ':;' '  '); do unzip -p "$j" META-INF/services/java.sql.Driver 2>/dev/null || true; echo; done \
      | grep -v '^#' | sed '/^$/d' | sort -u > /tmp/svc/META-INF/services/java.sql.Driver \
 && (cd /tmp/svc && zip -q /out/app/kof-app.jar META-INF/services/java.sql.Driver) \
 && echo "java.sql.Driver no jar: $(unzip -p /out/app/kof-app.jar META-INF/services/java.sql.Driver | tr '\n' ' ')" \
 && unzip -p /out/app/kof-app.jar META-INF/services/java.sql.Driver | grep -qx 'org.mariadb.jdbc.Driver' \
 && unzip -p /out/app/kof-app.jar META-INF/services/java.sql.Driver | grep -qx 'org.h2.Driver'

# ---------------------------------------------------------------------------
# Run stage: JRE 25. As classes geradas do projeto sao V21 (major 65), mas o runtime do Kof
# copiado junto (dev/kof/runtime/*) e compilado pelo JDK 25 do pacote (major 69):
# num JRE 21 o boot morre com UnsupportedClassVersionError.
# Execucao: o fat jar (classes + runtime do Kof + drivers do kofdeps) com java -jar.
# KOF_ENV=production torna KOF_DB_URL obrigatoria (PERS-23): o container nao sobe sem banco configurado.
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jre
# /app/data gravavel pelo usuario kof: sem KOF_ENV=production o backend usa H2 em ./data (medido:
# sem isto o boot morria com AccessDeniedException /app/data).
RUN useradd --system --uid 10001 --home-dir /app kof \
 && mkdir -p /app/data && chown kof:kof /app/data
WORKDIR /app
COPY --from=build --chown=kof:kof /out/app/kof-app.jar /app/kof-app.jar
USER kof
ENV PORT=8080 KOF_ENV=production
EXPOSE 8080
ENTRYPOINT ["java", "-Dkof.root=/app", "-jar", "/app/kof-app.jar"]
