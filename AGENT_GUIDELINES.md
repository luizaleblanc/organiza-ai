# Guidelines para Uso de Agentes com Kof no Frontend (Organiza IA)

Bem-vindo ao Organiza IA! Se você é um novo colaborador ou um agente de IA escalado para ajudar no Frontend, este documento estabelece as diretrizes e o estado atual da arte do nosso uso da linguagem Kof (versão 0.4.1-beta).

## 1. O Novo Paradigma: 100% Kof
Nosso projeto passou por uma migração total (Kof Migrate). **Todos os resquícios de Java e Spring Boot foram erradicados**.
- **Backend:** Foi absorvido para a lógica nativa Kof (utilizando `kof.orm` quando no alvo JVM, ou mocks in-memory no JS Webview enquanto o ORM não ganha paridade).
- **Frontend:** Desenvolvido puramente em `kof.ui`.

## 2. Instruções para Novos Agentes (Mapeamento de Gargalos do Design System)

Seu objetivo como Agente é auditar o app e mapear gargalos que impedem a fidelidade 100% ao `DESIGN_SYSTEM.md` e contorná-los (ou reportá-los). Siga este fluxo:

1. **Inspecione o KofJS Runtime (Deep Dive)**
   - O Kof converte código `kof.ui` para CSS e DOM estrito (`window.__kofNodes`).
   - Use subagentes (Gemini Flash) para ler os arquivos `.java` do compilador em `Kof4j` (especialmente `JsRuntimeUiLayout.java` e `JsRuntimeUiWidgets.java`). O conhecimento da infraestrutura subjacente é vital para entender por que propriedades visuais falham (ex: por que `View` dá `VerifyError` no JVM, ou por que flexbox é engessado no JS).

2. **Identifique Limitações de Renderização**
   - O KofJS ainda restringe injeção direta de CSS (sem gradientes complexos multi-stop, sem suporte a fontes externas diretas, sem `justify-content`/`align-items` dinâmicos em flexbox).
   - Registre essas limitações e proponha patches de compilador (como o `RawView` que projetamos) em um PR formal para o repositório principal da linguagem (`Kof4j`).

3. **Utilize a Pasta de Treinamento (`training/`)**
   - O repositório `Kof4j` contém uma pasta `training` com extensa documentação otimizada para LLMs (`*.pt_BR.md`).
   - Sempre faça uma busca (`findstr` ou `grep`) nessa pasta para entender os "Comportamentos Esperados" e a "Filosofia do Kof" (ex: Menos segregação, mais intenção) antes de arquitetar soluções.

4. **Trabalhe em Bypasses Seguros no Frontend**
   - Na ausência do PR aprovado na linguagem base, utilize Canvas, composições de views e estruturas alternativas (`Stack`, `Box`) para emular os componentes do Design System.

Mantenham-se sempre atualizados lendo os changelogs de novas versões do Kof (como a 0.4.1-beta recém chegada com correções do VerifyError e suporte Java 25).
