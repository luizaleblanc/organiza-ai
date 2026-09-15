# Pull Request para Kof4j / Organiza IA (100% Kof)

**Para:** Melissa (Mantenedora do Kof4j)
**De:** Equipe Organiza IA

## 1. Migração 100% Kof Finalizada
Informamos que o projeto Organiza IA concluiu a erradicação do backend legado em Java/Spring Boot. 
- O diretório `src/main/java` e `src/test` foram deletados.
- Toda a lógica de banco de dados e rotas HTTP foi unificada usando o Kof 0.4.1-beta (`frontend/core/database.kf` via `kof.orm`).
- Consolidamos o monólito conforme a filosofia oficial da linguagem ("Menos segregação, mais intenção").

## 2. Relatório de Bugs e Gaps (Alvo JVM vs JS)
Embora a versão 0.4.1-beta tenha corrigido a maior parte dos `VerifyError` (como anunciado), descobrimos através de subagentes analisando o AST e Bytecode do compilador que **o ecossistema `kof.ui` ainda quebra no alvo JVM**. 

Componentes que instanciam interfaces gráficas complexas (ex: `View`, `Canvas` com iteradores de cores em listas genéricas) acionam falhas na validação do bytecode Java (`Type integer is not assignable to reference type`) porque a UI usa handles primitivos internamente, gerando conflitos de inferência de tipos. 

**Workaround Atual:** O projeto roda primorosamente na Web usando `kof run --target=js` com um mock in-memory, provando a robustez da geração de estado e CSS do KofJS.

## 3. Proposta de PR para KofJS (Design Systems Mobile-First)
Para que aplicações reais como o Organiza fiquem fidedignas aos Design Systems sem hacks, mapeamos as restrições de CSS na engine do KofJS e criamos o artefato `kof_ui_improvements_pr.md` na nossa workspace. 

Este artefato contém a implementação pronta (em nível de runtime Java do compilador) para:
- `RawView` (Escape hatch controlado para injeção de CSS bruto como Gradients e Box Shadows multi-layer).
- Modificação em `Row/Column` para admitir propriedades flexíveis de alinhamento (`justifyContent`).
- Um hook nativo `Theme.loadFontUrl()` para importar tipografia externa (Google Fonts) para dentro do contexto bloqueado do Kof.

Pedimos a revisão e a integração destes recursos na branch `main` do Kof4j.
