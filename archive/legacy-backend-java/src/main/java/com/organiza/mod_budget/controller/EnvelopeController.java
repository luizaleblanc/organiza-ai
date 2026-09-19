package com.organiza.mod_budget.controller;

import com.organiza.mod_budget.dto.CreateEnvelopeRequest;
import com.organiza.mod_budget.dto.EnvelopeDTO;
import com.organiza.mod_budget.model.EnvelopeEntity;
import com.organiza.mod_budget.model.EnvelopeLimitType;
import com.organiza.mod_budget.service.EnvelopeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/envelopes")
public class EnvelopeController {

    private final EnvelopeService envelopeService;

    public EnvelopeController(EnvelopeService envelopeService) {
        this.envelopeService = envelopeService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EnvelopeDTO create(@Valid @RequestBody CreateEnvelopeRequest request) {
        EnvelopeEntity envelope = new EnvelopeEntity(request.userId(), request.categoryName(), request.limitAmount());
        if (request.limitType() != null) {
            envelope.setLimitType(request.limitType());
        }
        if (request.movingAverageMonths() != null) {
            envelope.setMovingAverageMonths(request.movingAverageMonths());
        }
        return EnvelopeDTO.from(envelopeService.create(envelope));
    }

    @GetMapping
    public List<EnvelopeDTO> list(@RequestParam String userId) {
        return envelopeService.findByUserId(userId).stream().map(EnvelopeDTO::from).toList();
    }

    @PutMapping("/{id}")
    public EnvelopeDTO update(@PathVariable String id, @Valid @RequestBody CreateEnvelopeRequest request) {
        EnvelopeEntity updated = new EnvelopeEntity(request.userId(), request.categoryName(), request.limitAmount());
        updated.setLimitType(request.limitType() != null ? request.limitType() : EnvelopeLimitType.FIXED);
        updated.setMovingAverageMonths(request.movingAverageMonths() != null ? request.movingAverageMonths() : 3);
        return EnvelopeDTO.from(envelopeService.update(id, updated));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        envelopeService.delete(id);
    }
}
