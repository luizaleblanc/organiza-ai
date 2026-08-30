<img width="1911" height="1007" alt="organiza-ia" src="https://github.com/user-attachments/assets/2d56ff9d-deca-4996-978b-afe82440d167" />

# Organiza IA — Voice-Driven Budgeting API

Uma aplicação full-stack para gerenciamento de transações financeiras pessoais utilizando **Inteligência Artificial**, **Processamento de Linguagem Natural (NLP)** e **comandos de voz**. O backend é uma API REST em **Java + Spring Boot**; o frontend é uma interface web em **Next.js** com autenticação, gravação de voz e um dashboard financeiro.

---

## Visão Geral

O projeto foi desenvolvido seguindo uma arquitetura modular, integrando modelos de IA para automatizar todo o fluxo de entrada de dados financeiros.

O pipeline permite que o usuário registre movimentações financeiras apenas falando, enquanto a aplicação é responsável por:

- Transcrever o áudio enviado;
- Interpretar a intenção do usuário utilizando LLMs;
- Classificar a transação automaticamente em uma de 12 categorias financeiras;
- Executar automaticamente as regras de negócio com validações de segurança;
- Retornar uma confirmação por voz da operação realizada.

O usuário acessa tudo isso por uma interface web própria (splash → login/cadastro → gravação de voz → resumo financeiro), protegida por autenticação com JWT.

> 📄 **Para desenvolvedores:** as decisões arquiteturais e de negócio do projeto (o "porquê" por trás de cada escolha técnica) estão documentadas em [`DECISIONS.md`](./DECISIONS.md), atualizado a cada fase e a cada commit relevante. O estado atual da implementação está em [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).

---

## Pipeline de Inteligência Artificial

O processamento ocorre de forma assíncrona em três etapas principais.

### 1. Transcrição

- Conversão de arquivos de áudio em texto.
- Utilização do modelo **OpenAI Whisper**.

### 2. Orquestração e Processamento

- Integração com **GPT-4o** através do **Spring AI**.
- Utilização de **Tool Calling** para converter intenções do usuário em chamadas para funções Java (como persistência e cálculo de totais por categoria).
- Classificação automática da transação em uma das 12 categorias suportadas (veja [Categorias Suportadas](#categorias-suportadas)), com fallback seguro para categorias não reconhecidas.
- Execução dinâmica das regras de negócio protegidas por cláusulas de guarda.

### 3. Síntese de Voz

- Geração de respostas utilizando modelos **Text-to-Speech (TTS)**.
- Confirmação audível das operações executadas.

---

## Stack Tecnológica

### Backend

| Tecnologia | Descrição |
|------------|-----------|
| Java 17 | Linguagem principal |
| Spring Boot 3.2.5 | Framework backend |
| Spring AI 1.0.0-M1 | Integração com modelos de IA |
| Spring Security + JWT (jjwt) | Autenticação e autorização com papéis (roles) |
| Apache HttpClient5 | Cliente HTTP para chamadas à API da OpenAI |
| JUnit 5 & Mockito | Testes unitários e mocks |
| MySQL | Banco de dados |
| Docker Compose | Infraestrutura do banco |
| Gradle | Gerenciamento de dependências |

### Frontend

| Tecnologia | Descrição |
|------------|-----------|
| Next.js 16 (App Router) | Framework React, com Server Actions e Proxy (middleware) |
| TypeScript | Tipagem estática |
| Tailwind CSS v4 | Estilização |
| Recharts | Gráfico de gastos por categoria |
| Web Audio API / MediaRecorder | Captura de áudio no navegador |

---

## Configuração e Execução

### Pré-requisitos

Antes de executar o projeto, certifique-se de possuir:

- Java JDK 17 ou superior;
- Node.js 20 ou superior;
- Docker;
- Docker Compose;
- Uma API Key da OpenAI.

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (não versionado):

```env
OPENAI_API_KEY=sua_chave_aqui
```

### Inicialização do Backend

#### 1. Carregar as variáveis de ambiente (PowerShell)

```powershell
Get-Content .env | Where-Object { $_.Trim() -ne '' } | Foreach-Object {
    $var = $_.Split('=', 2)
    [Environment]::SetEnvironmentVariable($var[0].Trim(), $var[1].Trim(), "Process")
}
```

#### 2. Executar a aplicação

O Docker Compose do banco de dados (MySQL) sobe automaticamente junto com a aplicação.

```bash
./gradlew bootRun
```

A API fica disponível em `http://localhost:8080`.

#### 3. Executar os testes automatizados

```bash
./gradlew test
```

### Inicialização do Frontend

```bash
cd frontend-voice
npm install
npm run dev
```

A interface web fica disponível em `http://localhost:3000`.

---

## Arquitetura

### Backend

O backend segue princípios de **Clean Architecture**, promovendo separação de responsabilidades entre as camadas.

```text
src
├── application
│   ├── usecases
│   └── functions
│
├── domain
│   ├── entities
│   └── repositories
│
└── infrastructure
    ├── controllers
    ├── persistence
    ├── security
    └── configurations
```

#### Application

Responsável pelos casos de uso da aplicação, validações de regras de negócio (cláusulas de guarda) e pelas implementações da interface `Function`, permitindo que a IA interaja diretamente com as operações do sistema.

#### Domain

Contém as entidades e os contratos de repositório, representando o núcleo da aplicação.

#### Infrastructure

Implementa os adaptadores externos, incluindo:

- Controllers REST com suporte a CORS;
- Autenticação e autorização (JWT, filtros de segurança, papéis de usuário);
- Persistência de dados utilizando Spring Data JPA;
- Configurações e integrações com serviços externos.

### Frontend

Aplicação Next.js (App Router) atuando como BFF (Backend-for-Frontend) da API, com as seguintes telas:

```text
frontend-voice/src
├── app
│   ├── page.tsx              # Splash screen
│   ├── login/                # Login e cadastro
│   ├── dashboard/             # Gravação de voz (tela principal)
│   │   └── finance/           # Resumo financeiro (gráfico e transações)
│   ├── api/                   # Rotas de proxy para a API Java (BFF)
│   └── actions/               # Server Actions (login, cadastro, logout)
├── components/                # Componentes de UI reutilizáveis
├── lib/                       # Metadados compartilhados (categorias, cores)
└── proxy.ts                   # Proteção de rotas autenticadas
```

A autenticação é feita via cookie `httpOnly` contendo o JWT emitido pelo backend; o `proxy.ts` redireciona usuários não autenticados para o login e usuários já autenticados diretamente para o dashboard.

---

## Categorias Suportadas

A IA classifica cada transação automaticamente em uma destas 12 categorias:

| Categoria | Nome exibido |
|-----------|--------------|
| `GROCERIES` | Mercado |
| `LEISURE` | Lazer |
| `FOOD` | Alimentação |
| `PHARMA` | Farmácia |
| `HEALTH` | Saúde |
| `AUTO` | Automóvel |
| `TRANSPORT` | Transporte |
| `HOUSING` | Moradia |
| `EDUCATION` | Educação |
| `SHOPPING` | Compras |
| `SUBSCRIPTIONS` | Assinaturas |
| `OTHER` | Outros |

Caso a IA retorne um valor não reconhecido, o backend aplica um fallback seguro para `OTHER` em vez de rejeitar a transação.

---

## Funcionalidades Implementadas

- Cadastro e persistência de transações via voz protegidos por regras de validação (impedindo valores zerados ou negativos);
- Classificação automática em 12 categorias financeiras, com ícone e cor dedicados por categoria;
- Consulta de totais por categoria utilizando **Tool Calling**;
- Transcrição automática utilizando **Whisper**;
- Interpretação de comandos utilizando **GPT-4o**;
- Persistência em **MySQL**;
- Resposta por voz utilizando **Text-to-Speech (TTS)**;
- Autenticação de usuários com **JWT**, papéis (roles) e endpoint administrativo protegido;
- Interface web completa: splash screen, login/cadastro (com opção de mostrar/ocultar senha e validação de requisitos), gravação de voz e dashboard financeiro com gráfico de pizza por categoria;
- Proteção de rotas autenticadas no frontend (redirecionamento automático conforme sessão);
- Cobertura de testes unitários com **JUnit** e **Mockito** para os casos de uso críticos.

---

## Roadmap

* [x] Implementar testes unitários.
* [x] Desenvolver interface Web utilizando Web Audio API (Next.js).
* [x] Suporte a múltiplas moedas.
* [x] Histórico de conversas.
* [x] Dashboard financeiro.
* [x] Autenticação de usuários.
* [x] Deploy em ambiente cloud.

---

## Observações

Este projeto foi desenvolvido para fins de estudo e experimentação com Inteligência Artificial aplicada a sistemas full-stack (backend Java + frontend web).
