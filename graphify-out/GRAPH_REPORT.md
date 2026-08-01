# Graph Report - .  (2026-08-01)

## Corpus Check
- 167 files · ~245,879 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3931 nodes · 9345 edges · 215 communities (191 shown, 24 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 298 edges (avg confidence: 0.61)
- Token cost: 215,614 input · 0 output

## Community Hubs (Navigation)
- Main Chart App Core
- Scalp Gateway & State Machine
- Grad Calculator Module
- Gauge Presentation
- Calculator Module Core
- API Index & Install
- SMC Overlay Module
- Trade Report Builder
- Calculator Plan & Write Sync
- Canonical MA State
- Calculator Position Sync
- Pressure Signal Data Feed
- Binance User Stream
- Signal Publication Alignment
- Liquidation Heatmap Architecture
- MA Rows & Toggles
- Calculator Service Rows
- Binance Position Group Tracker
- Candle Chart Geometry
- Market Structure Detection
- Calculation Tests
- Calculator Stop Math
- Position Engine
- Action Snapshot Freshness
- Signal Engine State
- Scalp UI Controls
- Binance Data Source & Clock
- Signal Engine B
- Simulator Message Bridge
- Trade Contribution Drawing
- Session Shading Drawing
- Order State Snapshot
- Calculation Core
- Supabase Logger
- Signal Tooltip Tests
- Signal Detector V2 Tests
- Supabase Service
- Account Settings Tests
- Heatmap Tests
- Funding Fee Windows
- Signal Detector Core Tests
- Settings Tab Registry Tests
- Monitor Heartbeat
- Event Panel Cache
- Scalp Tranches Tests
- Simulator Data
- Pressure Meter Drawing
- Chain Render Drawing
- Chart Control Binding
- Waterfall Trade Preview
- Signal C Evidence Tests
- Signed Strength Tests
- External Close Tests
- Signal B Supabase Logger
- Scalper Signal Pipeline
- Scalp Cascade Tests
- WebSocket Service Tests
- Liquidation Heatmap Puller
- Trade Data Packet
- Position Close Confirmation
- MA Settings Module
- Kill Switch Tests
- Account Settings Module
- Tranche Book
- Canonical Candle Series
- Package Dependencies
- Chart Controls Tests
- Signal Engine C
- Orchestration Core
- Simulator UI Tests
- Trade Isolate Chain
- WF Crosshair Preview
- Exchange Info & Brackets
- Funding & Chain Setup
- Closed Marker Drawing
- Rolling Digit Animation
- MA Stack Tooltip
- API Capability Card
- REST Service
- Action Pressure Samples
- Scalp Runtime Tests
- Open Position Visual Sync
- Signal C Model Tests
- Aggregate Role Regression Tests
- Fee-Aware Calculations
- MA Pair Labeling
- API Credentials & Trades
- Trade Link Rendering
- Signal Transition Tracker
- Settings Registry Fake DOM
- Binance State Reconciliation
- GPT Market Analysis
- WebSocket Service
- Monitoring & Signal Tables
- Reporting Tests
- Open Position Reconstruction
- Scalp Analysis Window Fetch
- Direction Mode Tests
- Market Context Snapshot Logger
- Tab Manifest
- Chart Focus & Pan
- Binance Account & Trades
- Trade Link Drawing
- V13 Technical Indicators
- Signal B Tests
- SSSC Input Sizing Tests
- Logging Worker
- Scalper Key Slots
- Waterfall Crosshair Tests
- Position Retrieval Cache
- Signal B Logger Install
- Daily VWAP Watch
- V13 Kline DB Cache
- Exchange Clock
- Routine Console Tests
- Signal Engine Registry Tests
- Scalp Simulator UI
- Conditional Order Classifier
- Canonical MA Rebuild
- Assess Prompt Store
- Open Box Tooltip
- Hover Price Metrics
- P9 Trade Chain Linking
- Scalper Symbol Activation
- Exit Decisions
- Simulator Data Tests
- Supabase Service Tests
- Open Entry Markers
- Chart Depth Fetch
- Assess Package Modal
- Tab Title PL Updater
- MA Pair Bounce Detection
- Test Runner
- Binance REST Module
- Grad Calculator Tests
- MA Series Module
- Readiness Score Tests
- Snapshot Logger Tests
- Logger Tests
- Scalp Exit Decisions Tests
- Chart Y-Range Scaling
- Private Stream Restart
- MA Pair Tooltip Text
- Market Data Fetch
- Signal UI Screenshot (Commit 4)
- Shared Position Fact Owner
- Chart Recovery Tests
- Pressure Toggle Handling
- Diagnostic Set Regression Tests
- Account Status Window
- Fake ClassList (Simulator)
- Fake ClassList (Settings)
- Open Tooltip Hover
- Trading Settings Normalize
- Position Tooltip Screenshot
- Leverage Hydration Tests
- Signal Engine A
- Simulator Message Bridge Tests
- Chart Candle Style Settings
- Settings Panel Buttons
- Stop Order Pool
- WF Crosshair Screenshot
- Shared Position Fact Tests
- Fake Observer (Chart Controls)
- MA Tooltip Module
- Exit Targets Evaluation
- Dashboard Display Tests
- Activity Logger
- Fake MemoryStorage (Scalp)
- MA Pair Slot Formatting
- EMA Toggle Persistence
- Countdown Overlay
- Day Separator Toggle
- Stop-Loss Overlay Drawing
- Patch8 Indicator Settings
- Indicator Settings Rebuild
- Crosshair Label Screenshot
- Binance WebSocket Module
- Calculator Domain Logic
- Trade Chain Builder
- Settings Drag Position
- Trade Link Overlap
- Closed Trades Tooltip Sync
- P8 Trade Isolate
- WF Return Diagnostics
- MA Overlay Module
- Browser Signal Detector
- Browser Signal Detector V2
- Closed Links Row
- Colored Closed Tooltip
- Open Tooltip Drawing
- Fee Quote & Balance
- Report Window Filter
- Timeframe Label Mapping
- Patch36 Trade PL Box
- Machine ID Env Var
- Apply/Restore Position
- Closed Links Card Range
- Closed Slider Sync
- Label Text Replacement
- Trade Record Marker
- MA Enable Toggle
- P8 Gross Normalize
- Panel Position Save
- Scalp Operational Table
- Scalp Positions Table
- Scalp Trades Table
- SSH Deploy Strategy

## God Nodes (most connected - your core abstractions)
1. `ScalpEngine` - 103 edges
2. `draw()` - 92 edges
3. `num()` - 76 edges
4. `readBinance()` - 56 edges
5. `clamp()` - 52 edges
6. `cfg()` - 50 edges
7. `currentSymbol()` - 49 edges
8. `q()` - 48 edges
9. `num37()` - 47 edges
10. `calculate()` - 45 edges

## Surprising Connections (you probably didn't know these)
- `draw()` --indirect_call--> `clip()`  [INFERRED]
  main.js → features/heatmap/heatmap.tests.js
- `createBinanceUserDataStream()` --indirect_call--> `stop()`  [INFERRED]
  features/api/binance-user-stream.module.js → main.js
- `ensureButton()` --indirect_call--> `delay()`  [INFERRED]
  features/grad-calculator/presentation/gradCalculatorModule.js → headless/pull-liquidation-heatmap.js
- `restorePersistentState()` --indirect_call--> `record()`  [INFERRED]
  features/grad-calculator/presentation/gradCalculatorModule.js → main.js
- `handlePressureToggleEvent()` --indirect_call--> `rect()`  [INFERRED]
  main.js → features/heatmap/heatmap.tests.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Liquidation heatmap browser rendering pipeline** — features_heatmap_provider_adapter_module, features_heatmap_state_module, features_heatmap_dataset_module, features_heatmap_renderer_module, features_heatmap_ui_module [INFERRED 0.85]
- **App Settings modal composition** — index_html_settings_modal, index_html_scalper_account_binance_keys, index_html_scalp_supabase_settings, index_html_strategy_lab, index_html_sssc_dashboard [EXTRACTED 1.00]
- **VM logging services checked by headless:monitor** — deploy_readme_sssc_logger_service, deploy_readme_scalp_signal_logger_service, deploy_readme_vm_logger_monitor_service [INFERRED 0.85]

## Communities (215 total, 24 thin omitted)

### Community 0 - "Main Chart App Core"
Cohesion: 0.01
Nodes (81): activeOpenParentChainIds, apiCapabilityState, apiKeyEl, apiKeysBtn, apiModal, apiSecretEl, candleRestInFlight, candles (+73 more)

### Community 1 - "Scalp Gateway & State Machine"
Cohesion: 0.06
Nodes (18): tranche(), create(), filterNumber(), flattenSymbolFilters(), hmacHex(), signedRequest(), timeOffset(), dualProtectionClientId() (+10 more)

### Community 2 - "Grad Calculator Module"
Cohesion: 0.07
Nodes (93): actionableRows(), applyGridLevels(), arrangeMetricButtons(), bind(), bindGenerator(), blinkSendButton(), buildReconcilePlan(), calculate() (+85 more)

### Community 3 - "Gauge Presentation"
Cohesion: 0.05
Nodes (82): createGaugeTracker(), directionRelativeAcceleration(), assert, calc, {directionRelativeAcceleration,createGaugeTracker}, fs, index, main (+74 more)

### Community 4 - "Calculator Module Core"
Cohesion: 0.06
Nodes (84): addManualRow(), alignOrdersOtfButtons(), animateOtfSelection(), bindCalculator(), blinkActiveForKey(), blinkSendSuccess(), calcLevelsInteractive(), calcSlInteractive() (+76 more)

### Community 5 - "API Index & Install"
Cohesion: 0.06
Nodes (54): buildApi(), install(), loadScript(), start(), loadScript(), start(), draw(), drawDecorations() (+46 more)

### Community 6 - "SMC Overlay Module"
Cohesion: 0.07
Nodes (60): alpha(), bindControl(), bindRadioGroup(), buildDrawings(), calculateStructureSnapshot(), candleTintFromBias(), cappedEvents(), clamp() (+52 more)

### Community 7 - "Trade Report Builder"
Cohesion: 0.06
Nodes (58): activeWfReport(), activeWfSignature(), addLot(), addM(), buildClosedTradeFastLimitedSummaries(), buildClosedTradeFastReport(), buildClosedTradeFastResolvedSummaries(), buildFastTradeRows() (+50 more)

### Community 8 - "Calculator Plan & Write Sync"
Cohesion: 0.09
Nodes (56): addPlanRow(), applyWriteSuccessToPartialStopRow(), applyWriteSuccessToRow(), approxEqual(), buildAlgoOrderMeta(), buildExternalChangeReason(), buildIgnoredRemovedRows(), buildLimitOrderMeta() (+48 more)

### Community 9 - "Canonical MA State"
Cohesion: 0.06
Nodes (56): alpha(), canonicalMAStorageKey(), canonicalMAStroke(), canonicalMAWidth(), clamp(), clusterState(), color(), crossState() (+48 more)

### Community 10 - "Calculator Position Sync"
Cohesion: 0.08
Nodes (54): activePositionGroup(), applyExpressPayloadSafeguards(), autoCleanupFlatPositionOrphans(), binanceResponseText(), buildReadStateSnapshot(), checkAutoSyncStructuralState(), clearFlatCleanupSignature(), clearSendPlan() (+46 more)

### Community 11 - "Pressure Signal Data Feed"
Cohesion: 0.06
Nodes (18): createPressureSignalDataFeed(), assert, CanonicalReplayHub, ema(), flatBias(), fs, gateway(), initializedEngine() (+10 more)

### Community 12 - "Binance User Stream"
Cohesion: 0.08
Nodes (38): classifyEvent(), createBinanceUserDataStream(), normalizeSymbol(), assert(), createSignalEngineRegistry(), normalizedId(), validateEngine(), validateOutput() (+30 more)

### Community 13 - "Signal Publication Alignment"
Cohesion: 0.09
Nodes (44): autoAlignmentBreakdown37(), buildDisplayedSignalPublication37(), buttonMatchesDisplayedSignal37(), compactDataStatus37(), compactStateText37(), conciseLevelText37(), detailBulletList37(), displayedDecisionDirection37() (+36 more)

### Community 14 - "Liquidation Heatmap Architecture"
Cohesion: 0.09
Nodes (43): liquidation_heatmap_snapshots table, APIFY_API_KEY, liquidation-heatmap systemd service, deploy/sql/liquidation_heatmap_snapshots.sql, liquidation-heatmap systemd timer, HeatmapProviderError, Read-only browser heatmap architecture, draw() (+35 more)

### Community 15 - "MA Rows & Toggles"
Cohesion: 0.07
Nodes (50): applyExpandedRect(), bindExtraRows(), bindMA(), bindWindow(), calcExtraMAs(), currentPeriodValue(), enabled(), ensureDailyDepth() (+42 more)

### Community 16 - "Calculator Service Rows"
Cohesion: 0.12
Nodes (47): buildSummary(), addRow(), applyMappedRow(), applyPartialStopSourceAndMeta(), applyRowSourceAndMeta(), clearBinanceMetaOnRow(), clearBinanceRowNeedsReview(), clearExitLotInvalidState() (+39 more)

### Community 17 - "Binance Position Group Tracker"
Cohesion: 0.12
Nodes (41): assert, fs, functionSource(), path, source, state(), activeGroup(), binanceKeys() (+33 more)

### Community 18 - "Candle Chart Geometry"
Cohesion: 0.05
Nodes (44): candleCenterAnyX13(), candleCenterX12(), candleCloseBoundaryMs(), candleIndexForEvent14(), candleIndexForEvent15(), chartTimestampToX(), clamp26(), date26() (+36 more)

### Community 19 - "Market Structure Detection"
Cohesion: 0.12
Nodes (41): candidateDistance37(), candidateRank37(), canonicalPivots37(), canonicalStructureEvidence37(), clamp37(), classifiedLevelState37(), compressionCandidates37(), confirmedCloseBeyond37() (+33 more)

### Community 20 - "Calculation Tests"
Cohesion: 0.05
Nodes (38): allIntervals, assert, calc, closeTo(), contradictory, diagnostic, even, evenlySeparated (+30 more)

### Community 21 - "Calculator Stop Math"
Cohesion: 0.12
Nodes (40): calculate(), calculateStopMath(), clearPartialStopLotInvalidState(), currentCalculatorLeverage(), currentFloatingPl(), currentOverlayRows(), currentPositionBoxesForCalculator(), currentPriceReference() (+32 more)

### Community 22 - "Position Engine"
Cohesion: 0.12
Nodes (36): advancePath(), buildManagementLevelMap(), currentConditions(), evaluate(), evaluateStops(), initializeCampaign(), interactionState(), levelRole() (+28 more)

### Community 23 - "Action Snapshot Freshness"
Cohesion: 0.10
Nodes (38): actionContextKey37(), actionDataPlan37(), actionFeed37(), actionInputRevision37(), actionLifecycle37(), buildActionFreshness37(), buildActionSnapshot37(), buildSignalSnapshot37() (+30 more)

### Community 24 - "Signal Engine State"
Cohesion: 0.12
Nodes (38): activeSignalEngine37(), analyticalInputRevision37(), bindActiveEngineState37(), configureSignalFeed37(), cycleStoredDirection37(), destroy37(), diagnostics37(), ensureEngineOwnedState37() (+30 more)

### Community 26 - "Binance Data Source & Clock"
Cohesion: 0.10
Nodes (31): createBinanceDataSource(), parseRestKline(), {sharedGate}, WebSocketClient, createNodeExchangeClock(), assert, {buildSsscRunner,createMarketFreshnessTracker}, {createBinanceDataSource,parseRestKline} (+23 more)

### Community 27 - "Signal Engine B"
Cohesion: 0.09
Nodes (32): Calculator application layer (orchestration/use-case logic), Calculator domain layer (pure calculations/value transforms), Calculator Feature, Calculator infrastructure layer (browser/API/storage adapters), Calculator presentation layer (DOM/canvas/interaction wiring), distributeLots(), estimatePl(), generateLevels() (+24 more)

### Community 28 - "Simulator Message Bridge"
Cohesion: 0.14
Nodes (32): atr(), availabilityMissing(), candleFlow(), closedRows(), computeReadinessScore(), createSignalEngineB(), createState(), directionEvidence() (+24 more)

### Community 29 - "Trade Contribution Drawing"
Cohesion: 0.13
Nodes (19): assert, {
  BinanceRestGate,
  parseBannedUntil,
  parseRetryAfter,
  constants
}, fs, path, run(), actionConfig(), cacheView(), dependencies() (+11 more)

### Community 30 - "Session Shading Drawing"
Cohesion: 0.11
Nodes (33): allParentTrades14(), calculatorStopRiskForBox21(), contributionForEntry12(), drawHoverTooltip(), drawSlForBox21(), drawStandaloneDollarView13(), entryContribution13(), entryContribution14() (+25 more)

### Community 31 - "Order State Snapshot"
Cohesion: 0.09
Nodes (33): bool22(), clamp22(), colorKey22(), dayIndex22(), dayStartUtc22(), defaultSessionOpacity22(), drawSessions22(), ensureSessionTfBadge22() (+25 more)

### Community 32 - "Calculation Core"
Cohesion: 0.13
Nodes (32): actionPrivateSnapshot37(), actionPublishedForContext37(), actionPublishedWithinSafeWindow37(), authoritativeOrders37(), directionEvidence37(), entryDisplayText37(), exitOrderStateSnapshot37(), grOrderOwnership37() (+24 more)

### Community 33 - "Supabase Logger"
Cohesion: 0.14
Nodes (30): aggregate(), atrSeries(), averageValues(), buildNormalization(), calculateTimeframe(), closeSeries(), clusterState(), crossState() (+22 more)

### Community 34 - "Signal Tooltip Tests"
Cohesion: 0.06
Nodes (29): assert, calculatedData, calculatedDiagnostic, calculatedLogger, calculatedRows, calculation, {createOrchestration}, data (+21 more)

### Community 35 - "Signal Detector V2 Tests"
Cohesion: 0.06
Nodes (24): actionSource, assert, beforeHover, bOutput, bSections, bText, button, cases (+16 more)

### Community 36 - "Supabase Service"
Cohesion: 0.07
Nodes (27): agreeingSlow, assert, bounceDetector, bounceFast, bounceHub, bounceRows, bounceSlow, candidate (+19 more)

### Community 37 - "Account Settings Tests"
Cohesion: 0.18
Nodes (26): buildDbAccessRows(), clearKey(), clearSlot(), clearUrl(), configured(), ensureWorker(), exchangeNow(), flushPending() (+18 more)

### Community 38 - "Heatmap Tests"
Cohesion: 0.10
Nodes (10): assert, ClassList, Element, fs, MemoryStorage, path, repo, run() (+2 more)

### Community 39 - "Funding Fee Windows"
Cohesion: 0.08
Nodes (5): assert, clip(), fs, path, vm

### Community 40 - "Signal Detector Core Tests"
Cohesion: 0.14
Nodes (26): cid25(), currentSymbol25(), ensureOpenCommissionFeeWindow25(), ensureOpenFundingFeeWindow25(), entryTimeOf25(), epochMs25(), exitTimeOf25(), getFundingIncomeRange() (+18 more)

### Community 41 - "Settings Tab Registry Tests"
Cohesion: 0.08
Nodes (24): activeRows, assert, bounceEvent, bounceGuard, bounceTrack, config, context, continuingAnalysis (+16 more)

### Community 42 - "Monitor Heartbeat"
Cohesion: 0.08
Nodes (20): assert, chartMount, fs, IDS, invalid, legacyControl, legacyMa, mainSource (+12 more)

### Community 43 - "Event Panel Cache"
Cohesion: 0.18
Nodes (23): canonicalize(), checkSystemdServices(), createSupabaseMonitorStore(), createSupabaseSnapshotReader(), evaluateHeartbeat(), incidentRow(), {loadDotEnv,required}, LOGGER_SERVICES (+15 more)

### Community 44 - "Scalp Tranches Tests"
Cohesion: 0.13
Nodes (25): activeVisibleTimeRange(), allowedLab(), cacheKey(), cb(), eventBucket(), eventBucketLab(), eventConfig(), eventNameLab() (+17 more)

### Community 45 - "Simulator Data"
Cohesion: 0.11
Nodes (14): assert, fs, hedgeGateway(), load(), path, repo, run(), signal() (+6 more)

### Community 46 - "Pressure Meter Drawing"
Cohesion: 0.16
Nodes (21): applyProfitLock(), closeOutcome(), create(), dedupeEvents(), detectorMetric(), detectorState(), entryCandleIndex(), eventAllowed() (+13 more)

### Community 47 - "Chain Render Drawing"
Cohesion: 0.13
Nodes (24): aggregatePressureRows(), compactRead(), compactTooltipLines(), computePressureModel(), currentTf(), drawCenteredClippedText(), drawCompactMeterTooltip(), drawDailyVolumeSplitVisual() (+16 more)

### Community 48 - "Chart Control Binding"
Cohesion: 0.21
Nodes (24): bigExTag18(), currentOpenRenderChainIds15(), dprValue(), drawAxisDayRangeVisual(), drawBoxLabel14(), drawCountdown(), drawMiniLabelAvoid13(), drawMode2DailyNetBoxes15() (+16 more)

### Community 49 - "Waterfall Trade Preview"
Cohesion: 0.09
Nodes (24): bind(), bindControl(), bindEventControl(), bindEventPanels(), bindSettings(), bindStyleControl(), canonicalChartMASeries(), clearIsolate() (+16 more)

### Community 50 - "Signal C Evidence Tests"
Cohesion: 0.13
Nodes (23): row(), absorptionState37(), adverseEvidenceGate37(), aggregateSignalRows37(), applySetupLifecycleFloor37(), averageTrueRange37(), candidateMaterialFailure37(), candidatePressureConfirmation37() (+15 more)

### Community 51 - "Signed Strength Tests"
Cohesion: 0.09
Nodes (22): aboveNeutralBoundary, assert, belowNeutralBoundary, blockedAdd, calc, exitAtHighRisk, highRisk, invertedStrength (+14 more)

### Community 52 - "External Close Tests"
Cohesion: 0.11
Nodes (13): activeBook(), assert, fs, gateway(), loadRuntime(), path, repo, run() (+5 more)

### Community 53 - "Signal B Supabase Logger"
Cohesion: 0.11
Nodes (20): buildSnapshotPayload(), createSnapshotLogger(), getLatestEvaluation(), setLatestEvaluation(), assert, comparisonDiagnostics, evaluation, fs (+12 more)

### Community 54 - "Scalper Signal Pipeline"
Cohesion: 0.12
Nodes (15): createSignalDetectorCore(), createSignalDetectorV2Core(), createSignalPipeline(), buildScalperSignalRunner(), {createBinanceDataSource}, {createLoggerRunner,installProcessShutdown}, {createNodeExchangeClock}, {createScalpMarketHub} (+7 more)

### Community 55 - "Scalp Cascade Tests"
Cohesion: 0.11
Nodes (12): assert, event(), fakeGateway(), fs, MemoryStorage, path, repo, run() (+4 more)

### Community 56 - "WebSocket Service Tests"
Cohesion: 0.09
Nodes (17): assert, connectionStatusSource, connVisual, connVisualSource, FakeWebSocket, first, formingRevisionCallSites, fs (+9 more)

### Community 57 - "Liquidation Heatmap Puller"
Cohesion: 0.16
Nodes (18): loadDotEnv(), parsePeriods(), path, readConfig(), required(), {createClient}, delay(), headers() (+10 more)

### Community 58 - "Trade Data Packet"
Cohesion: 0.13
Nodes (22): activePrompt(), activeSL(), appCurrentPrice(), boxRows(), buildDataPacket(), buildFullPackage(), chainId(), currentSymbol() (+14 more)

### Community 59 - "Position Close Confirmation"
Cohesion: 0.19
Nodes (21): binanceWriteConfirmed(), cancelOpenPositionCloseChs(), cancelOpenPositionCloseChsOrderOnly(), clearCalculatorLocal(), clearOpenPositionCloseChsTimer(), confirmOpenPositionCloseOrder(), findOpenPositionCloseChsOrder(), finishOpenPositionCloseChs() (+13 more)

### Community 60 - "MA Settings Module"
Cohesion: 0.22
Nodes (20): alpha(), bindSettingsRow(), bindVWAPSettings(), color(), enabled(), ensureToggle(), ensureToggles(), getCanonicalMASettings() (+12 more)

### Community 61 - "Kill Switch Tests"
Cohesion: 0.11
Nodes (11): assert, fakeGateway(), fs, MemoryStorage, path, repo, run(), runtime() (+3 more)

### Community 62 - "Account Settings Module"
Cohesion: 0.18
Nodes (18): accountMode(), activeSymbol(), bindCredentialButton(), credentialInputFor(), getCredentials(), getInterfaceCredentials(), getScalperCredentials(), hasScalperKeys() (+10 more)

### Community 63 - "Tranche Book"
Cohesion: 0.22
Nodes (19): activeQuantity(), activeTranches(), add(), canAdd(), close(), count(), counts(), create() (+11 more)

### Community 64 - "Canonical Candle Series"
Cohesion: 0.12
Nodes (17): strictlyIncreasingUnique(), assert, assertionIndex, closed, emaIndex, finalRow, first, fs (+9 more)

### Community 65 - "Package Dependencies"
Cohesion: 0.11
Nodes (18): dotenv, dependencies, dotenv, @supabase/supabase-js, ws, description, name, private (+10 more)

### Community 66 - "Chart Controls Tests"
Cohesion: 0.11
Nodes (17): assert, body, canvas, classList(), context, document, element(), fs (+9 more)

### Community 67 - "Signal Engine C"
Cohesion: 0.25
Nodes (17): acceleration(), analyzeTimeframe(), atr(), createSignalEngineC(), createState(), crossClosePrice(), crossForecast(), emaSeries() (+9 more)

### Community 68 - "Orchestration Core"
Cohesion: 0.13
Nodes (14): createOrchestration(), assert, calculation, {createOrchestration,warmupTargets}, fs, path, warmupTargets(), wsBase() (+6 more)

### Community 69 - "Simulator UI Tests"
Cohesion: 0.15
Nodes (9): assert, elementMap(), FakeElement, fs, path, run(), testLauncher(), testPopup() (+1 more)

### Community 70 - "Trade Isolate Chain"
Cohesion: 0.17
Nodes (19): activateIsolateFromPlLabel36(), activateIsolateIdentity36(), bridgeTradeIsolate(), buildChain36(), cid36(), clearIsolateState36(), closedPlBoxAtMouse(), findTradePlHit() (+11 more)

### Community 71 - "WF Crosshair Preview"
Cohesion: 0.15
Nodes (19): activeWfTradeKey(), fitWfDirectionLabels(), fitWfResultValues(), livePreviewTrade(), maybeRefreshLivePreview(), renderChart(), renderWfCrosshair(), runWfCrosshairSelfTests() (+11 more)

### Community 72 - "Exchange Info & Brackets"
Cohesion: 0.12
Nodes (19): bracketSummary(), ensureApiCapabilityCard(), fetchExchangeInfo(), fetchSelectedSymbolTradingSettings(), filterValue(), findBracketInfo(), getCached(), hmac() (+11 more)

### Community 73 - "Funding & Chain Setup"
Cohesion: 0.14
Nodes (19): chainIdOf(), dailyCloseRows(), ensureMaToggles(), fundingMatchInfo15(), fundingSumForWindow15(), fundingValue15(), groupExecutionRows12(), installAll() (+11 more)

### Community 74 - "Closed Marker Drawing"
Cohesion: 0.21
Nodes (18): activeOpenChainIds15(), circle(), closedMarkerMetrics15(), drawClosedMarker15(), drawFullTrades15(), drawMarker15(), drawMode2Marker15(), drawSimplifiedTrades15() (+10 more)

### Community 75 - "Rolling Digit Animation"
Cohesion: 0.14
Nodes (18): animateRollingDigits(), blinkClass(), calc(), changedValue(), chip(), ensurePipeline(), eventRows(), kpi() (+10 more)

### Community 76 - "MA Stack Tooltip"
Cohesion: 0.14
Nodes (18): buildStackRank(), combinedDisplayScore(), compactRankTooltipHtml(), compactTooltipHtml(), ensureMaStackTooltip(), escHtml(), eventIdentity(), hideMaStackTooltip() (+10 more)

### Community 77 - "API Capability Card"
Cohesion: 0.12
Nodes (18): dirLabel(), displayChars(), formatApiError(), formatDateTime(), magClass(), markLiveUpdate(), odoCell(), permissionText() (+10 more)

### Community 78 - "REST Service"
Cohesion: 0.20
Nodes (3): RestError, RestService, traceHeatmapWire()

### Community 79 - "Action Pressure Samples"
Cohesion: 0.16
Nodes (17): actionPressureSamples37(), calculateActionPublication37(), completeness37(), deterministicActionFingerprint37(), exitDisplayText37(), frozenActionPublication37(), frozenPublicationInvariant37(), isolationTextFingerprint37() (+9 more)

### Community 80 - "Scalp Runtime Tests"
Cohesion: 0.15
Nodes (11): assert, event(), fakeGateway(), fs, path, repo, run(), runtime() (+3 more)

### Community 81 - "Open Position Visual Sync"
Cohesion: 0.18
Nodes (17): applyOpenPositionVisualSync21(), feeQuote21(), fetchOpenTradeDeltaRows21(), hasEarlierOpenEntry21(), hasOpenParentContext21(), makeOpenFillMarker21(), markerForTradeFill21(), pnlAtLevel21() (+9 more)

### Community 82 - "Signal C Model Tests"
Cohesion: 0.15
Nodes (11): assert, defaultFlow(), fs, modelFacts(), path, phase(), reversalRows(), root (+3 more)

### Community 83 - "Aggregate Role Regression Tests"
Cohesion: 0.12
Nodes (13): assert, base, calc, configured, equalRoles, fullDisagreement, missingOneTrigger, missingStrength (+5 more)

### Community 84 - "Fee-Aware Calculations"
Cohesion: 0.24
Nodes (14): estimate(), feeAwareBreakeven(), feeRates(), formatNumeric(), linkedPreview(), linkedSide(), normalizeLot(), preview() (+6 more)

### Community 85 - "MA Pair Labeling"
Cohesion: 0.13
Nodes (16): actionableMaPair(), applyHigherTfAgreement(), clamp100(), classify(), emaSeries(), labEventBucket(), labEventSettingKey(), labStackStillValid() (+8 more)

### Community 86 - "API Credentials & Trades"
Cohesion: 0.19
Nodes (16): activeApiCredentials(), clearClosedTradesOwner(), clearTrades(), closeApi(), handleMarketChange(), handleReloadClick(), hasKeys(), openSettings() (+8 more)

### Community 87 - "Trade Link Rendering"
Cohesion: 0.23
Nodes (16): allParentTrades15(), closedTradeLinksForRender(), closedTradeMarkersForRender(), entryContribution15(), exitEvent15(), focusIsolate36(), fullTradeTooltip15(), markerOwnTooltip15() (+8 more)

### Community 88 - "Signal Transition Tracker"
Cohesion: 0.17
Nodes (13): createSignalTransitionTracker(), assert, blipTracker, calculation, {createSignalTransitionTracker}, {createSupabaseLogger}, entry, entryTracker (+5 more)

### Community 89 - "Settings Registry Fake DOM"
Cohesion: 0.15
Nodes (3): descendants(), FakeElement, matches()

### Community 90 - "Binance State Reconciliation"
Cohesion: 0.20
Nodes (15): authoritativeOrderSnapshot21(), binanceStateSig21(), markPrivateDirty21(), publishBinanceStateChange21(), reconcilePrivateState21(), recoverVisibleAccounts21(), refocusDiag(), refocusDiagNow() (+7 more)

### Community 91 - "GPT Market Analysis"
Cohesion: 0.18
Nodes (15): v13AnalyzeCurrentMarket(), v13BindEvents(), v13BuildAnalysisText(), v13CallGpt(), v13CheckRequirements(), v13CloseGptModal(), v13CloseLabPanel(), v13HasGptKey() (+7 more)

### Community 93 - "Monitoring & Signal Tables"
Cohesion: 0.20
Nodes (14): monitoring_incidents table, scalp_v1_signals table, scalp_v2_signals table, sssc_snapshots table, deploy/sql/futures_market_snapshots.sql, deploy/sql/monitoring_incidents.sql, scalp-signal-logger systemd service, deploy/sql/scalp_v2_signals.sql (+6 more)

### Community 94 - "Reporting Tests"
Cohesion: 0.18
Nodes (10): assert, FakeElement, FakeNode, fs, path, renderedText(), repo, run() (+2 more)

### Community 95 - "Open Position Reconstruction"
Cohesion: 0.25
Nodes (14): activeChainIdsFromReconstruction(), applyOpenPositionReconstruction(), applyOpenPositionRiskOnly(), buildOpenBoxes(), clearOpenPositionOwner(), filterClosedReconstructionForPeriod(), latest21(), refreshOpenPositionOnly14() (+6 more)

### Community 96 - "Scalp Analysis Window Fetch"
Cohesion: 0.19
Nodes (13): END_TIME, fs, isoTime(), klineUrl(), main(), normalizeRow(), OUT_FILE, path (+5 more)

### Community 97 - "Direction Mode Tests"
Cohesion: 0.17
Nodes (8): assert, fs, path, root, rows(), run, snapshot(), vm

### Community 98 - "Market Context Snapshot Logger"
Cohesion: 0.22
Nodes (10): buildSnapshotPayload(), createSnapshotLogger(), diagnosticsByInterval(), timeframePayload(), unavailableTimeframePayload(), createFuturesMarketContextLogger(), assert, {CONTEXT_INTERVAL_MS,TABLE,createFuturesMarketContextLogger} (+2 more)

### Community 99 - "Tab Manifest"
Cohesion: 0.21
Nodes (5): adoptIds(), apis(), chart(), sessions(), strategyLab()

### Community 100 - "Chart Focus & Pan"
Cohesion: 0.23
Nodes (13): applyFocus(), centerLastAndResetY15(), clampView(), focusIsolatedTrade(), markChartViewAction(), p8FocusIsolatedTrade(), pan(), range() (+5 more)

### Community 101 - "Binance Account & Trades"
Cohesion: 0.29
Nodes (13): cfg(), fetchRecentUserTrades21(), getAccountBalance(), getFundingIncome(), getIncomeRowsRange(), getPositions(), getTrades(), getUserTradesRange() (+5 more)

### Community 102 - "Trade Link Drawing"
Cohesion: 0.23
Nodes (13): drawBigExTags18(), drawFullTrades14(), drawMarker14(), drawSimplifiedTrades14(), inTime(), linkTimeOverlap14(), parentIdFromMarker18(), segmentFromLink14() (+5 more)

### Community 103 - "V13 Technical Indicators"
Cohesion: 0.19
Nodes (13): v13ATR(), v13Bollinger(), v13BuildDataReadiness(), v13CollectCurrentMarketData(), v13CompactCandles(), v13EMA(), v13MACD(), v13Round() (+5 more)

### Community 104 - "Signal B Tests"
Cohesion: 0.17
Nodes (6): assert, fs, path, root, run, vm

### Community 105 - "SSSC Input Sizing Tests"
Cohesion: 0.17
Nodes (10): assert, fixedAfterZoomBackfill, fixedAtNormalZoom, fs, mainSource, older, path, recent (+2 more)

### Community 106 - "Logging Worker"
Cohesion: 0.17
Nodes (6): BT001LoggingWorkerMain(), assert, {createRuntime}, MemoryStore, createRuntime(), memoryStorage()

### Community 107 - "Scalper Key Slots"
Cohesion: 0.29
Nodes (12): clearScalperKeys(), consumePendingScalperSymbol(), getInterfaceSlot(), getNickname(), getSlot(), notify(), render(), reportConnectionStatus() (+4 more)

### Community 108 - "Waterfall Crosshair Tests"
Cohesion: 0.18
Nodes (10): assert, closedTrades, css, difference(), fs, money(), path, root (+2 more)

### Community 109 - "Position Retrieval Cache"
Cohesion: 0.21
Nodes (12): activeParentCacheKey(), activePositionFromRisk(), clearActiveParentCache(), loadActiveParentReconstruction(), openPositionRetrievalSig(), openPositionRetrievalState(), readActiveParentCache(), reconstructionOpenMatchesPosition() (+4 more)

### Community 110 - "Signal B Logger Install"
Cohesion: 0.26
Nodes (12): classifyTimeframe(), ensureDom(), ensureSignalBSnapshotLogger(), fetchTf(), hub(), hubRowToKline(), installSignalBSnapshotLogger(), refresh() (+4 more)

### Community 111 - "Daily VWAP Watch"
Cohesion: 0.20
Nodes (12): currentVWAPSeries(), fetchDaily(), handleIntervalChange(), loadChart(), pollOnce(), sameDay(), setCurrentVWAPSeries(), startDailyTimer() (+4 more)

### Community 112 - "V13 Kline DB Cache"
Cohesion: 0.24
Nodes (12): parseRest(), v13DbGetTf(), v13DbOpen(), v13DbReplaceTf(), v13DbSupported(), v13FetchKlines(), v13FetchKlinesDirect(), v13FetchLatestDeep() (+4 more)

### Community 113 - "Exchange Clock"
Cohesion: 0.22
Nodes (7): createExchangeClock(), assert, {createExchangeClock}, fs, path, {createExchangeClock}, {sharedGate}

### Community 114 - "Routine Console Tests"
Cohesion: 0.18
Nodes (9): assert, calculator, clock, fs, gate, main, path, root (+1 more)

### Community 115 - "Signal Engine Registry Tests"
Cohesion: 0.20
Nodes (8): assert, fs, mockEngine(), output(), path, root, run, vm

### Community 117 - "Conditional Order Classifier"
Cohesion: 0.44
Nodes (10): classify(), isLive(), kindFromOrder(), liveStatusOf(), num(), quantityOf(), toUpper(), triggerPriceOf() (+2 more)

### Community 118 - "Canonical MA Rebuild"
Cohesion: 0.24
Nodes (11): bindBaseRows(), bindMaRows(), CANONICAL_MA_SLOTS, EMA(), emaPeriod(), indicators(), injectSettings(), rebuildCanonicalMASeries() (+3 more)

### Community 119 - "Assess Prompt Store"
Cohesion: 0.40
Nodes (11): bindPromptControls(), loadPromptStore(), loadSelectedPromptIntoEditor(), mountAssessSettings(), nextPromptId(), normalizePromptStore(), refreshPromptControls(), savePromptStore() (+3 more)

### Community 120 - "Open Box Tooltip"
Cohesion: 0.24
Nodes (11): boxTooltipLines24(), cid24(), currentSymbol24(), latestClose24(), markerById24(), n24(), openBoxMargin(), openBreakdown24() (+3 more)

### Community 121 - "Hover Price Metrics"
Cohesion: 0.25
Nodes (11): candleTip(), css(), currentMetricPrice(), currentOpenPositionQty(), drawHoverPriceOnRightAxis(), fv(), ip(), lotMetric() (+3 more)

### Community 122 - "P9 Trade Chain Linking"
Cohesion: 0.33
Nodes (11): p9ApplyParentTradeIds(), p9CloseDisplayPnl(), p9ContributionForEntry(), p9ExitPnl(), p9LinkSort(), p9MarkerById(), p9MarkerChainId(), p9MarkerSort() (+3 more)

### Community 123 - "Scalper Symbol Activation"
Cohesion: 0.22
Nodes (10): activateScalperSymbol(), bind(), bindStatusDrag(), closeScalperApiModal(), closeStatusWindow(), publishCredentialChange(), restoreScalperKeys(), setMarketSymbol() (+2 more)

### Community 124 - "Exit Decisions"
Cohesion: 0.36
Nodes (7): actionLevel(), beLevel(), beReached(), profitLockDecision(), profitLockLevel(), profitLockQuantity(), profitLockReached()

### Community 125 - "Simulator Data Tests"
Cohesion: 0.29
Nodes (9): assert, candle(), eventRow(), fs, path, repo, run(), runtime() (+1 more)

### Community 126 - "Supabase Service Tests"
Cohesion: 0.20
Nodes (6): assert, fs, path, root, run, vm

### Community 127 - "Open Entry Markers"
Cohesion: 0.22
Nodes (10): activeOpenChainId21(), activePosition21(), cid21(), currentSymbol21(), entrySequenceMap21(), fetchOpenOrders21(), openEntryCount21(), openEntryMarkers21() (+2 more)

### Community 128 - "Chart Depth Fetch"
Cohesion: 0.24
Nodes (10): chartDesiredClosedDepth(), chartIndicatorPeriodValue(), chartIndicatorWarmupTarget(), fetchInitial(), iv(), klines(), klinesForInterval(), longestEnabledChartIndicatorPeriod() (+2 more)

### Community 129 - "Assess Package Modal"
Cohesion: 0.24
Nodes (10): copyText(), ensurePackageModal(), ensureWarningModal(), failureReport(), hidePackageModal(), onAssessClick(), setBusy(), showPackageModal() (+2 more)

### Community 130 - "Tab Title PL Updater"
Cohesion: 0.20
Nodes (10): currentLivePrice(), openBoxesFloating(), p11ExpectedPlAtPrice(), scheduleTitle26(), startTitleUpdater(), titlePL(), titlePrice(), updateTabTitle() (+2 more)

### Community 131 - "MA Pair Bounce Detection"
Cohesion: 0.24
Nodes (10): detectMaPair(), detectPriceMA(), isConfirmedBounce(), isFailedCross(), labPairIndexes(), labPairStillValid(), maLabelP(), pairEventRank() (+2 more)

### Community 132 - "Test Runner"
Cohesion: 0.20
Nodes (8): failed, files, fs, path, results, root, {spawnSync}, testDirs

### Community 133 - "Binance REST Module"
Cohesion: 0.44
Nodes (8): deleteData(), fetch(), getData(), getRest(), postData(), request(), requestJson(), updateData()

### Community 134 - "Grad Calculator Tests"
Cohesion: 0.22
Nodes (8): assert, context, css, fs, path, result, source, vm

### Community 135 - "MA Series Module"
Cohesion: 0.39
Nodes (7): assignSlotSeries(), computeEMA(), getActiveChartMASeries(), getCanonicalMAPeriods(), getCanonicalMASlots(), readSeriesMap(), rebuildSeries()

### Community 136 - "Readiness Score Tests"
Cohesion: 0.22
Nodes (6): assert, fs, path, root, run, vm

### Community 137 - "Snapshot Logger Tests"
Cohesion: 0.22
Nodes (8): assert, calculation, context, data, fs, path, payload, vm

### Community 138 - "Logger Tests"
Cohesion: 0.22
Nodes (8): assert, client, context, fs, logger, path, vm, writes

### Community 139 - "Scalp Exit Decisions Tests"
Cohesion: 0.31
Nodes (8): assert, fs, path, plain(), repo, run(), runtime(), vm

### Community 140 - "Chart Y-Range Scaling"
Cohesion: 0.25
Nodes (9): autoYRange(), candleOnlyYRange(), captureFocus(), currentStoredYRange(), ensureManualY(), resolveTimeframeViewState(), scaleY(), validRange() (+1 more)

### Community 141 - "Private Stream Restart"
Cohesion: 0.36
Nodes (8): applyPrivateStreamStatus21(), privateSnapshot21(), schedulePrivateStreamRestart21(), selectedPrivateWsBase21(), selectedRestBase21(), SHARED_POSITION_OWNER, sharedPositionSig21(), startPrivateUserStream21()

### Community 142 - "MA Pair Tooltip Text"
Cohesion: 0.25
Nodes (8): bounceSetupClassification(), cleanMaPairPeriodText(), cleanMaPairTypeText(), eventText(), freshMaPairEventText(), maPairAgeText(), maPairTooltipLine(), maPairTooltipSummary()

### Community 143 - "Market Data Fetch"
Cohesion: 0.39
Nodes (8): cfgRest(), fetchJson(), fetchKlines(), fetchMarkKlines(), fetchOI(), loadMarketData(), parseKline(), publicBase()

### Community 144 - "Signal UI Screenshot (Commit 4)"
Cohesion: 0.43
Nodes (7): Commit 4 Refinement Targets (Trading Signal UI Screenshot), Balanced Low 0.6x WAIT Meter (50/50 green/red split), Bullish 3m CHOCH Confirmed at 64,674 (Change of Character signal), Candlestick Chart with London/Overlap/US Session Shading, Signal Details Panel (invalidation, obstacle, target, absorption fields), Multi-Timeframe Strength Indicator Row (1m-1D bull/bear ticks), LONG 71% Trigger Active Banner

### Community 145 - "Shared Position Fact Owner"
Cohesion: 0.62
Nodes (6): createSharedPositionFactOwner(), factFromAccountUpdate(), factFromRisk(), normalizePosition(), runSelfTests(), signature()

### Community 146 - "Chart Recovery Tests"
Cohesion: 0.29
Nodes (6): assert, fs, load, main, path, visibility

### Community 147 - "Pressure Toggle Handling"
Cohesion: 0.33
Nodes (7): rect(), handlePressureToggleEvent(), hitRect(), pressureEventPoint(), requestRedraw(), setPressureLookback(), setPressureMode()

### Community 148 - "Diagnostic Set Regression Tests"
Cohesion: 0.29
Nodes (6): assert, calculation, confirmed, {createOrchestration}, live, pipeline

### Community 149 - "Account Status Window"
Cohesion: 0.38
Nodes (7): badge(), esc(), formatSync(), openStatusWindow(), renderStatus(), row(), yesNo()

### Community 152 - "Open Tooltip Hover"
Cohesion: 0.29
Nodes (7): coloredTooltip24(), distSeg(), hoverItem(), init24(), installOpenTooltip24(), installResizable24(), lineText24()

### Community 153 - "Trading Settings Normalize"
Cohesion: 0.29
Nodes (7): normalizePrice(), normalizeQty(), samePrice(), sameQty(), tradingSettingsNormalize(), tradingSettingsNum(), tradingSettingsPrecision()

### Community 154 - "Position Tooltip Screenshot"
Cohesion: 0.47
Nodes (6): Signal Position Tooltip Columns Screenshot, Position Health Tooltip (three-column diagnostic panel), London/US Session Shaded Candlestick Chart, SSSC Strategy Signal (BTCUSDC 15m), Strategy Lab UI, Unavailable/Stale Data State (management, exit, target, volatility fields)

### Community 155 - "Leverage Hydration Tests"
Cohesion: 0.40
Nodes (5): assert, fs, functionSource(), path, source

### Community 156 - "Signal Engine A"
Cohesion: 0.47
Nodes (4): createSignalEngineA(), createState(), evaluateSignalADirectionalThesis(), resolveSignalADirectionMode()

### Community 157 - "Simulator Message Bridge Tests"
Cohesion: 0.40
Nodes (5): assert, fs, path, run(), vm

### Community 158 - "Chart Candle Style Settings"
Cohesion: 0.40
Nodes (6): applyChartCandleStyles(), bindChartSettingsCard(), chartSettingsMarkup(), ensureChartSettingsCard(), readChartStyleSetting(), renameChartSettingsLabels()

### Community 159 - "Settings Panel Buttons"
Cohesion: 0.33
Nodes (6): closeSettings(), openApi(), openBinanceSettings(), v13InstallSettingsButton(), v13OpenLab(), v13UpdateContextBox()

### Community 160 - "Stop Order Pool"
Cohesion: 0.33
Nodes (6): isStopLossOrder21(), liveOrder21(), pickStopForBox21(), positionSideMatches21(), stopOrderPool21(), stopPrice21()

### Community 161 - "WF Crosshair Screenshot"
Cohesion: 0.60
Nodes (5): Closed Positions P&L Bar Chart (16/Jul, +$1,500 total), EMA9 / EMA21 Overlay Controls, Strategy Lab UI Screenshot (WF Crosshair Alignment), SSSC Strategy (BTCUSDC, 15m), Walk-Forward (WF) / Trades Display Toggle

### Community 162 - "Shared Position Fact Tests"
Cohesion: 0.40
Nodes (4): assert, fs, path, vm

### Community 164 - "MA Tooltip Module"
Cohesion: 0.70
Nodes (4): formatValue(), installTooltipOwner(), maMasterVisible(), valueAt()

### Community 165 - "Exit Targets Evaluation"
Cohesion: 0.70
Nodes (4): evaluateBinanceExits(), evaluateGrLadder(), evaluateTargets(), selfTest()

### Community 166 - "Dashboard Display Tests"
Cohesion: 0.40
Nodes (4): assert, fs, path, source

### Community 169 - "MA Pair Slot Formatting"
Cohesion: 0.40
Nodes (5): bindRows(), detail(), fmt(), pairSlots(), signed()

### Community 170 - "EMA Toggle Persistence"
Cohesion: 0.40
Nodes (5): canonicalMAEnabled(), emaToggleStoreKey(), persistEmaToggle(), restoreEmaSettings(), restoreEmaToggle()

### Community 171 - "Countdown Overlay"
Cohesion: 0.40
Nodes (5): countdownText(), ensureOverlay(), exchangeNow(), formatLeft(), updateCountdownOverlay()

### Community 172 - "Day Separator Toggle"
Cohesion: 0.40
Nodes (5): daySeparatorEnabled(), installButton(), installDaySeparatorToggle(), installSoon(), redraw()

### Community 173 - "Stop-Loss Overlay Drawing"
Cohesion: 0.40
Nodes (5): drawOpenEntryNumbersOnTop21(), drawSlOverlay21(), eventX21(), isFloatingOverlayOn21(), normalizeTime21()

### Community 174 - "Patch8 Indicator Settings"
Cohesion: 0.40
Nodes (5): installPatch8IndicatorSettings(), p8CardTitle(), p8Row(), p8StyleVal(), p8Val()

### Community 175 - "Indicator Settings Rebuild"
Cohesion: 0.50
Nodes (5): rebuildIndicatorSettings18(), row18(), styleVal18(), v18(), widthVal18()

### Community 176 - "Crosshair Label Screenshot"
Cohesion: 0.83
Nodes (4): Closed Positions Profit Histogram Overlay, Crosshair Value Labels (+$1,500 / +$1,000 / +$500), Crosshair Label Positioning Screenshot (Strategy Lab / SSSC BTCUSDC), SSSC Strategy Lab UI (BTCUSDC, 15m timeframe)

### Community 177 - "Binance WebSocket Module"
Cohesion: 0.83
Nodes (3): connectWebSocket(), createWebSocket(), getWs()

### Community 178 - "Calculator Domain Logic"
Cohesion: 0.83
Nodes (3): estimatePl(), toNumber(), weightedAverage()

### Community 179 - "Trade Chain Builder"
Cohesion: 0.50
Nodes (4): activateIsolate(), buildTradeChain(), chainIdOfMarker(), markerById()

### Community 180 - "Settings Drag Position"
Cohesion: 0.67
Nodes (4): applyStoredPosition23(), clamp23(), installSettingsDrag23(), settingsParts23()

### Community 181 - "Trade Link Overlap"
Cohesion: 0.67
Nodes (4): clipped(), linkOverlap(), priceAt(), visTime()

### Community 182 - "Closed Trades Tooltip Sync"
Cohesion: 0.50
Nodes (4): ensureClosedTradesTooltip(), renderClosedTradeStatus(), syncClosedTradesSummaryVisibility(), syncTradeToggleState14()

### Community 183 - "P8 Trade Isolate"
Cohesion: 0.50
Nodes (4): p8ActivateIso(), p8BuildChain(), p8ChainOfMarker(), p8MarkerById()

### Community 184 - "WF Return Diagnostics"
Cohesion: 0.50
Nodes (4): profitRatioCell(), renderSummary(), returnPctCell(), wfReturnDiagnostics()

### Community 190 - "Closed Links Row"
Cohesion: 0.67
Nodes (3): closedAlpha(), closedWidth(), installClosedLinksRow()

### Community 191 - "Colored Closed Tooltip"
Cohesion: 0.67
Nodes (3): coloredClosedTooltip15(), colorTooltipValue15(), pnlColor15()

### Community 192 - "Open Tooltip Drawing"
Cohesion: 1.00
Nodes (3): drawOpenTooltip25(), measureLine25(), partFont25()

### Community 193 - "Fee Quote & Balance"
Cohesion: 0.67
Nodes (3): feeQuote(), quote(), updateAccountBalanceFromBalance()

### Community 194 - "Report Window Filter"
Cohesion: 0.67
Nodes (3): filterReconstructionForReport(), reportWindowSec(), tradeWindow()

### Community 195 - "Timeframe Label Mapping"
Cohesion: 0.67
Nodes (3): getDiagnosticForTf(), intervalToTfLabel(), tfLabelToInterval()

### Community 196 - "Patch36 Trade PL Box"
Cohesion: 0.67
Nodes (3): patch36Cid(), patch36ClosedTradePlBox(), plHitFromMouse()

## Ambiguous Edges - Review These
- `Walk-Forward (WF) / Trades Display Toggle` → `Closed Positions P&L Bar Chart (16/Jul, +$1,500 total)`  [AMBIGUOUS]
  artifacts/wf-crosshair-alignment.png · relation: conceptually_related_to

## Knowledge Gaps
- **631 isolated node(s):** `fs`, `path`, `{
  BinanceRestGate,
  parseBannedUntil,
  parseRetryAfter,
  constants
}`, `assert`, `fs` (+626 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Walk-Forward (WF) / Trades Display Toggle` and `Closed Positions P&L Bar Chart (16/Jul, +$1,500 total)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `stop()` connect `Market Context Snapshot Logger` to `Main Chart App Core`, `Orchestration Core`, `Pressure Signal Data Feed`, `Binance User Stream`, `Private Stream Restart`, `Signal B Logger Install`, `Daily VWAP Watch`, `Signal B Supabase Logger`, `Binance Data Source & Clock`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **Why does `index.html (BTC Futures Realtime Chart app shell)` connect `API Index & Install` to `Main Chart App Core`, `Signal Engine B`, `Signal Publication Alignment`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `createLoggerRunner()` connect `Binance Data Source & Clock` to `Scalp Gateway & State Machine`, `Market Context Snapshot Logger`, `Scalper Signal Pipeline`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `draw()` (e.g. with `clip()` and `n()`) actually correct?**
  _`draw()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fs`, `path`, `{
  BinanceRestGate,
  parseBannedUntil,
  parseRetryAfter,
  constants
}` to the rest of the system?**
  _631 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Main Chart App Core` be split into smaller, more focused modules?**
  _Cohesion score 0.012121212121212121 - nodes in this community are weakly interconnected._