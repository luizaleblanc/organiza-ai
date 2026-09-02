package com.organiza.mod_user.controller;

import com.organiza.shared.service.TierEnforcementService;
import com.organiza.shared.service.TierStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class TierStatusController {

    private final TierEnforcementService tierEnforcementService;

    public TierStatusController(TierEnforcementService tierEnforcementService) {
        this.tierEnforcementService = tierEnforcementService;
    }

    @GetMapping("/tier-status")
    public TierStatus tierStatus() {
        return tierEnforcementService.getTierStatus();
    }
}
