package com.organiza.mod_variable_income.controller;

import com.organiza.mod_variable_income.dto.VariableIncomeDTO;
import com.organiza.mod_variable_income.model.VariableIncomeEntity;
import com.organiza.mod_variable_income.service.VariableIncomeService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/variable-income")
public class VariableIncomeController {

    private final VariableIncomeService variableIncomeService;

    public VariableIncomeController(VariableIncomeService variableIncomeService) {
        this.variableIncomeService = variableIncomeService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public VariableIncomeDTO create(@RequestBody VariableIncomeDTO request) {
        var entity = new VariableIncomeEntity(request.userId(), request.amount(), request.source(), null);
        return VariableIncomeDTO.from(variableIncomeService.save(entity));
    }

    @GetMapping
    public List<VariableIncomeDTO> list(@RequestParam String userId) {
        return variableIncomeService.findByUserId(userId).stream().map(VariableIncomeDTO::from).toList();
    }
}
