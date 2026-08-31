package com.organiza.mod_budget.service;

import com.organiza.mod_budget.repository.EnvelopeEntityRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class EnvelopeService {

    private final EnvelopeEntityRepository envelopeEntityRepository;

    public EnvelopeService(EnvelopeEntityRepository envelopeEntityRepository) {
        this.envelopeEntityRepository = envelopeEntityRepository;
    }

    /**
     * TODO: TransactionEntity ainda nao tem envelope_id (ver PROJECT_STATUS.md,
     * secao "Campos/tabelas que FALTAM"). Implementar a consulta real dos gastos
     * dos ultimos N meses assim que esse campo existir.
     */
    public BigDecimal calculateMovingAverage(String envelopeId, int months) {
        envelopeEntityRepository.findById(envelopeId).orElseThrow();
        return BigDecimal.ZERO;
    }
}
