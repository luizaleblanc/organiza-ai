package com.organiza.mod_budget.model;

public enum BudgetModelType {
    STANDARD_503020,       // Padrao: 50% necessidades, 30% desejos, 20% futuro
    SURVIVAL_702010,       // Sobrevivencia: 70% necessidades, 20% folga, 10% guarda
    ANTI_DEBT_701020,      // Anti-divida: 70% necessidades, 10% minimo, 20% quitar divida
    SIMPLE_8020,           // Simplificado: 80% viver, 20% guardar
    KAKEIBO,               // Reflexivo: 4 categorias (essencial, cultural, lazer, extras)
    FREELANCER_BASE_ZERO   // Base zero: renda irregular, alocacao por entrada
}
