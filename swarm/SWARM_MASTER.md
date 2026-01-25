# Kalshi Trading System - Agent Swarm Build

## Mission
Transform the current losing model into a profitable trading system by:
1. Collecting better horizon-aware data
2. Adding advanced features (volatility, cross-asset, order flow, time patterns)
3. Rigorous validation with gates that must pass before deployment

## Success Criteria
- Model beats market on log loss (negative delta) on at least 2/3 horizons
- ECE < 0.15 on all horizons
- Positive simulated PnL at optimal threshold
- Walk-forward validation passes

## Phase Gates

### Phase 1: Data Collection (24-48 hours)
- [ ] Fresh data stream running with --horizons-only
- [ ] Minimum 500 samples per horizon (T-15, T-30, T-60)
- [ ] Data quality validation passes

### Phase 2: Feature Engineering
- [ ] Volatility regime features implemented
- [ ] Cross-asset correlation features implemented
- [ ] Order flow features implemented
- [ ] Time-of-day features implemented
- [ ] All features validated (no lookahead, no NaN)

### Phase 3: Model Training
- [ ] Separate horizon models trained
- [ ] Walk-forward validation completed
- [ ] At least 2/3 horizons beat market

### Phase 4: Integration & Testing
- [ ] Inference pipeline updated with new features
- [ ] Paper trading integration tested
- [ ] End-to-end validation passes

### Phase 5: Deployment
- [ ] Documentation updated
- [ ] Start script updated
- [ ] Paper trading launched

## Agent Roster

| Agent | Role | File |
|-------|------|------|
| 1 | Coordinator | swarm/agent_coordinator.md |
| 2 | Data Engineer | swarm/agent_data.md |
| 3 | Feature Engineer | swarm/agent_features.md |
| 4 | ML Engineer | swarm/agent_ml.md |
| 5 | Validator | swarm/agent_validator.md |
| 6 | Integration Engineer | swarm/agent_integration.md |
| 7 | Documentation | swarm/agent_docs.md |
| 8 | Watchdog | swarm/agent_watchdog.md |

## Communication Protocol
- All agents report to Coordinator
- Watchdog can HALT any agent for violations
- Phase gates require Validator + Watchdog approval
- No agent proceeds to next phase without gate clearance

## Current State
- Data collection: NEEDS RESTART with --horizons-only
- Features: BASIC (need enhancement)
- Model: LOSES TO MARKET (needs retraining)
- Status: PHASE 1 START
