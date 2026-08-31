package com.organiza.mod_budget.service;

import com.organiza.mod_budget.model.EnvelopeEntity;
import com.organiza.mod_budget.repository.EnvelopeEntityRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Service
public class EnvelopeService {

    private final EnvelopeEntityRepository envelopeEntityRepository;

    public EnvelopeService(EnvelopeEntityRepository envelopeEntityRepository) {
        this.envelopeEntityRepository = envelopeEntityRepository;
    }

    public EnvelopeEntity create(EnvelopeEntity envelope) {
        return envelopeEntityRepository.save(envelope);
    }

    public List<EnvelopeEntity> findByUserId(String userId) {
        return envelopeEntityRepository.findByUserId(userId);
    }

    public EnvelopeEntity update(String id, EnvelopeEntity updated) {
        EnvelopeEntity envelope = envelopeEntityRepository.findById(id).orElseThrow();
        envelope.setCategoryName(updated.getCategoryName());
        envelope.setLimitAmount(updated.getLimitAmount());
        envelope.setLimitType(updated.getLimitType());
        envelope.setMovingAverageMonths(updated.getMovingAverageMonths());
        return envelopeEntityRepository.save(envelope);
    }

    public void delete(String id) {
        envelopeEntityRepository.deleteById(id);
    }

    public EnvelopeEntity updateSpent(String envelopeId, BigDecimal amount) {
        EnvelopeEntity envelope = envelopeEntityRepository.findById(envelopeId).orElseThrow();
        envelope.setCurrentSpent(envelope.getCurrentSpent().add(amount));
        return envelopeEntityRepository.save(envelope);
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
