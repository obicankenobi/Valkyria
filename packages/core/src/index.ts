// Publikt paketgränssnitt för @seventh-front/core.
//
// Fler exports läggs till allteftersom respektive prompt i
// ETAPP1_TEKNISK_SPEC.md avsnitt 10 bygger dem.
export * from './types.js'
// P100: stående order — validering och läsare som gränssnittet (P101) återanvänder i stället för att upprepa reglerna.
export { emptyStandingOrders, standingLineOrder, standingStationMode, validateStandingOrderChange } from './standingOrders.js'
export * from './rng.js'
export { round } from './money.js'
export { createInitialState, cloneState } from './state.js'
// P169: anläggningarna — linjerna bor i verken; gränssnitt och harness läser dem genom de här.
// P170: tomten och byggena.
// P171/P172: uppsättning, omställning, planen, underleverantörer och "ready by".
export { SETUP_LABEL, designRoot, setupChange, setupCost } from './tooling.js'
export { OUTSOURCE_SHARES, canBuildHere, lineMayBuild, outsourceTarget, ownRemaining, subcontractRate } from './outsourcing.js'
export { capacityOutlook, productionBoard } from './capacity.js'
export type { BoardContract, BoardLine, BoardSegment, CapacityOutlook, CapacityRequest, ProductionBoard } from './capacity.js'
export { worksAlarms } from './worksAlarms.js'
export type { WorksAlarm, WorksAlarmKind } from './worksAlarms.js'
export { standingPlan } from './standingOrders.js'
export { foreignSite, foreignWorks } from './foreign.js'
export type { ForeignSite } from './foreign.js'
export { facilityCard, worksAbroadOptions, worksBuildOptions, worksSite } from './facilityCard.js'
export type { AbroadOption, BuildOption, FacilityCardData, FacilityLamp } from './facilityCard.js'
export { MAINTENANCE_LEVELS, maintenanceOf } from './maintenance.js'
export { STAFFING_STEPS, hasWorkforce } from './workforce.js'
export { FACILITY_KINDS, advanceConstruction, facilityFixedCost, freePlotSlots, kindLabel, plotOf, validateWorksChange, worksUpkeep } from './construction.js'
export { totalFixedCosts } from './resolve/steps/economy.js'
export { FACILITY_DATA, allLines, assemblyWorks, findLine, freeLineSlots, lineCapacity, worksFromLines } from './works.js'
export type { StartChoices } from './state.js'
export { resolveTurn } from './resolve/index.js'
export { createWireEmitter, pruneWire, WIRE_WINDOW_TURNS, WIRE_CHAIN_DEPTH } from './wire.js'
// P31 (ETAPP2_TEKNISK_SPEC.md avsnitt 6.2): härnessens rivalAttributionShare-
// kolumn måste skilja spelarens nyckel i Front.attribution från en rivals —
// samma "läs källan, upprepa den aldrig" som DISPLAY_THRESHOLDS/BOT_BALANCE.
export { PLAYER_ATTRIBUTION_KEY } from './resolve/steps/deliveries.js'
export type { WireEmitter } from './wire.js'
export {
  bidEstimate,
  playerWinCurve,
  boardReviewOutlook,
  boardReviewRequirement,
  boardMemo,
  orderTerms,
  DISPLAY_THRESHOLDS,
  BOT_BALANCE,
  INFLUENCE_BALANCE,
  effectiveDepth,
  formationDisplay,
  officialDisplay,
  deriveSectorControl,
  projectedQuarter,
  researchOutlook,
  estimateLineCompletionTurn,
  designDisplay,
  designStartPreview,
  designBidStamps,
  researchTrackPreview,
  buyerPreferenceDisplay,
  raceAssessment,
} from './queries.js'
export type { DesignBidStamps, DesignStartPreview, ResearchTrackPreview, DesignDisplay, PlayerWinCurvePoint, BoardReviewOutlook, BoardMemo, BoardMemoItem, OrderTerms, CreditGrade, DriverLevel, ProjectedQuarter, CategoryResearchOutlook, RaceAssessment } from './queries.js'
// getProduct/allProducts: paketets ENDA väg till produktkatalogen (avsnitt 6) för
// extern kod — packages/harness (P9) behöver getProduct för att avgöra om en order
// gäller en restricted-produkt (Order har bara productId, inte en kopia av
// restricted-flaggan). allProducts (P85): THE COMPANY behöver hela katalogen för
// att visa R&D:s "vad låser den här kategorin upp härnäst" (researchOutlook).
// computeUnitCostNow: appen (P21, spec 3.4) behöver den för att räkna marginal per
// aktivt kontrakt mot DAGENS kostnad (supplyCostIndex rör sig efter kontraktet
// tecknades), inte bara mot Contract.unitCostAtSigning.
export { getProduct, allProducts, computeUnitCostNow } from './pricing.js'
// officialId: appen och testerna behöver kunna slå upp en faktions
// procurement-tjänsteman utan att duplicera id-schemat (P54, se officials.ts).
export { officialId, findOfficial } from './officials.js'
// P78 (ETAPP7_TEKNISK_SPEC.md §7.4): validateAction/previewAction — appens
// enda väg att pröva ett kort mot exakt samma regler som resolveTurn faktiskt
// använder (P79). ActionValidation/ActionPreview exporteras redan via
// `export * from './types.js'` ovan.
export { validateAction } from './validateAction.js'
// P127: budmappen filtrerar konstruktionerna med samma prövning som bidding.ts.
export { CUSTOMISE_TERMS, bidDesignRejection } from './design.js'
export { DESIGNERS, DESIGNER_TRAIT_TEXT, designerEmployer, hireCostFor, hiredDesigner } from './designer.js'
export type { DesignerFile, DesignerTrait } from './designer.js'
export { LICENCE_TERMS, licenceRivalId } from './licence.js'
export { CIVIL_CATEGORIES, CIVIL_PRODUCT_NAME, civilOptions, civilRevenueFor, civilShare, isCivilCategory } from './civil.js'
export { exclusivityRejection, isExportControlled, isExportViolation } from './exportRules.js'
// P125: pappersspåret — gränssnittet (P128) läser sannolikhet, rent rykte och avstängning ur samma funktioner som reglerna.
export { INTEGRITY_START, cleanHouse, integrityBidTerm, isSuspendedFrom, traceSurfaceChancePct } from './traces.js'
export { previewAction } from './previewAction.js'
export { coverageForDepth, grownCoverage } from './stationCoverage.js'
export type { Coverage } from './stationCoverage.js'
// P85: THE COMPANY behöver samma vaktade konstanter INTERNAL/MARKET-formulären
// redan valideras mot (validateAction.ts), i stället för att TheHouse.tsx
// (P21) upprepar sin egen lokala kopia av TECH_CATEGORIES/HIRABLE_ROLES.
export { COMMODITIES, TECH_CATEGORIES, HIRABLE_ROLES } from './validateAction.js'
export type { HirableRole } from './validateAction.js'
// P89: krönikan (byggd i resolveTurn(), se resolve/index.ts) och
// epilogen (scenarioVerdict, härledd — samma "härledd, inte lagrad"-princip
// som bidEstimate/ActionPreview). ChronicleEntry/ChronicleKind/ScenarioVerdict/
// NuclearEpilogue exporteras redan via `export * from './types.js'` ovan.
export { classifyChronicleEntries, appendChronicle, CHRONICLE_CAP } from './chronicle.js'
export { scenarioVerdict } from './scenarioVerdict.js'

// P99: förskottsformlerna, så budformuläret (packages/app) och härnessen läser exakt de som betalar.
export { advanceAmount, advanceFactors, computeAdvancePct, deliveryPayment } from './resolve/advance.js'

// P109 (ETAPP9 §5): konstruktionerna — namn-/klasshjälpare som gränssnittet (P126) återanvänder i stället för att upprepa dem.
export type { PreferenceMix } from './design.js'
export { DESIGN_AMBITIONS, DESIGN_SPREAD, DESIGN_ENVIRONMENTS, DESIGN_FOCUSES, QUALITY_CLASSES, buyerPreferenceMix, designBaseProduct, frontEnvironments, qualityClassOf } from './design.js'
export {
  BLOCS,
  addCounterDemand,
  accelerateBlocStep,
  advanceDesignLifecycle,
  advanceRace,
  advancePerception,
  bothSidesSelling,
  checkBothSides,
  inflateAssessment,
  parseAssessmentTarget,
  perceivedBudgetPct,
  claimFirstInPlace,
  blocGeneration,
  blocOfAlignment,
  blocOfFaction,
  counterBidTerm,
  counterCategoryOf,
  counterReaction,
  designPhasedOutForBloc,
  designPhasedOutForBuyer,
  effectiveRivalReputation,
  fieldedGeneration,
  firstInPlaceBidTerm,
  gapPremium,
  gapShock,
  isFollowerTarget,
  frontierGeneration,
  houseCounters,
  initialRace,
  noveltyFactor,
  processRivalDesigns,
  requirementCards,
  rivalDesignSpec,
  yardstickAgainstPlayer,
  rivalDesignDisplay,
  scheduledGeneration,
} from './race.js'
export type { Bloc, RequirementCard, RivalDesignDisplay } from './race.js'
export {
  advanceProgrammes,
  applyProcurement,
  applyProgrammeChange,
  applyTestedReputation,
  counterPurchaseScore,
  evaluateTrial,
  maybeAnnounceProgramme,
  measureEntrant,
  programmeProtocol,
  programmeBloc,
  programmeEligible,
  programmeRequirements,
  validateProcurement,
  validateProgrammeChange,
} from './programme.js'
export type { ProtocolEntry, ProtocolView, TrialInputs, TrialMeasurement } from './programme.js'

// P176 (ETAPP11 §6): labb, ritkontor och provplats sätter tak.
export { climateChamber, designBlockedReason, designDesks, designOffice, isRobustDesign, laboratoryFor, laboratoryTechCap, provingGround, researchBlockedReason, testingBlockedReason } from './knowledge.js'
