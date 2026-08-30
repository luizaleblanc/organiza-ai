# PHASE 0 -- Foundation

## Contexto
O Organiza IA existe como um app de voz com backend Spring Boot (Clean Architecture) e frontend Next.js.
Esta fase reestrutura o backend em modulos, atualiza o schema e cria o scaffold Flutter.

## Escopo EXATO desta fase

### Backend
- [ ] Reestruturar packages: `com.organiza.mod_auth`, `com.organiza.mod_user`, `com.organiza.mod_transaction`, `com.organiza.mod_budget`, `com.organiza.mod_ai_coach`
- [ ] Cada modulo tem: `controller/`, `service/`, `repository/`, `dto/`, `model/`
- [ ] Atualizar Spring Boot para 3.3.x
- [ ] Atualizar Spring AI para versao estavel (1.0.0+)
- [ ] Adicionar dependencia Redis (spring-boot-starter-data-redis)
- [ ] Migrations: adicionar campos `salary` e `tier` na tabela `users`
- [ ] Criar tabelas `budgets` e `chat_messages`
- [ ] Adicionar campos `bucket` e `source` na tabela `transactions`

### Flutter
- [ ] Criar projeto Flutter: `organiza_ia`
- [ ] Arquitetura: `lib/core/`, `lib/features/`, `lib/shared/`
- [ ] Configurar: get_it, injectable, dio, go_router, flutter_bloc
- [ ] Design tokens: cores, tipografia, espacamento (tema escuro como padrao)
- [ ] Tela placeholder de login (JWT)

### BFF
- [ ] Adicionar rota `/api/auth/mobile` que retorna JWT bearer (sem cookie)

## Modelo de Dados

```sql
ALTER TABLE users ADD COLUMN salary DECIMAL(10,2);
ALTER TABLE users ADD COLUMN tier ENUM('FREE', 'PREMIUM') DEFAULT 'FREE';

CREATE TABLE budgets (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    month_year VARCHAR(7) NOT NULL,
    salary DECIMAL(10,2) NOT NULL,
    needs_limit DECIMAL(10,2) NOT NULL,
    wants_limit DECIMAL(10,2) NOT NULL,
    savings_limit DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY uk_user_month (user_id, month_year)
);

CREATE TABLE chat_messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    role ENUM('USER', 'ASSISTANT') NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

ALTER TABLE transactions ADD COLUMN bucket ENUM('NEEDS', 'WANTS', 'SAVINGS');
ALTER TABLE transactions ADD COLUMN source ENUM('MANUAL', 'VOICE', 'BANK_NOTIFICATION') DEFAULT 'MANUAL';
```

## Criterios de Aceite
1. Backend compila e roda com a nova estrutura modular
2. Migrations executam sem erro no MySQL
3. Testes existentes continuam passando
4. Flutter app roda no emulador com tela de login placeholder
5. Auth mobile retorna JWT bearer funcional

## Fora de Escopo
- Chat com IA (Fase 1)
- Dashboard (Fase 2)
- Voz (Fase 3)
- Qualquer tela alem de login placeholder
