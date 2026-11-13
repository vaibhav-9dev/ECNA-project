export type ElectrodeCount = 3 | 6;

export type TouchMode =
  | 'manual'
  | 'hover'
  | 'touch'
  | 'hold'
  | 'fast'
  | 'slow'
  | 'double';

export type CameraPreset = 'perspective' | 'top' | 'side' | 'cross-section';

export type FilterType = 'none' | 'ema' | 'moving_avg';

export type NavSection =
  | 'sensor-3d'
  | 'working-principle'
  | 'electronics'
  | 'circuit-diagram'
  | 'signal-lab'
  | 'algorithm-lab'
  | 'experiments'
  | 'performance';

export type OpAmpTopology = 'tia' | 'charge_integrator';

export interface SensorGeometry {
  electrodeCount: ElectrodeCount;
  sliderLengthMm: number; // Illustrative total active length (mm)
  sliderWidthMm: number; // Illustrative electrode height/width across track (mm)
  electrodeGapMm: number; // Gap between adjacent copper pads (mm)
  overlayThicknessMm: number; // Protective dielectric overlay thickness (mm)
  overlayPermittivity: number; // Relative permittivity ε_r (FR4/acrylic/glass)
  pcbThicknessMm: number; // FR-4 core thickness (mm)
  fingerRadiusMm: number; // Effective finger contact patch radius (mm)
}

export interface FingerState {
  xMm: number; // 0 .. sliderLengthMm
  heightMm: number; // 0 = contact with overlay surface, >0 = hovering
  isTouching: boolean; // Pointer pressed or touch mode active
  secondFingerEnabled: boolean;
  secondFingerXMm: number;
}

export interface NonIdealityParams {
  noiseEnabled: boolean;
  noiseAmplitudePf: number; // 0 .. 0.35 pF RMS
  couplingEnabled: boolean;
  couplingCoeff: number; // 0 .. 0.45 adjacent crosstalk fraction
  parasiticsEnabled: boolean;
  parasiticSpreadPf: number; // 0 .. 3.0 pF asymmetric baseline offset
  driftEnabled: boolean;
  driftAmplitudePf: number; // 0 .. 0.6 pF slow thermal/humidity drift
}

export interface ElectronicsParams {
  excitationFreqKHz: number; // 50 .. 500 kHz
  excitationVoltageV: number; // 1.0 .. 5.0 Vpp
  readoutGain: number; // 0.5 .. 3.0 post-stage / PGA gain multiplier
  adcBits: 10 | 12 | 14;
  vRef: number; // 3.3 V supply & ADC reference
  opAmpTopology: OpAmpTopology;
  feedbackResistanceKOhm: number; // R_f: 50 .. 1000 kOhm
  feedbackCapPf: number; // C_f: 1.0 .. 12.0 pF
  opAmpBiasV: number; // Virtual ground V_bias = V_DD / 2 (1.65 V)
}

export interface AlgorithmParams {
  touchThresholdPf: number; // Sum weight threshold to declare touch (pF)
  channelNoiseFloorPf: number; // Per-channel deadband floor (pF)
  filterType: FilterType;
  emaAlpha: number; // 0.05 .. 0.95
  movingAvgWindow: number; // 2 .. 12 samples
  couplingCompensation: boolean;
  compensationStrength: number; // 0 .. 1.0
  autoBaselineTracking: boolean;
}

export interface ElectrodeChannelSnapshot {
  index: number;
  label: string;
  centerMm: number;
  widthMm: number;
  spatialSensitivity: number; // 0 .. 1
  baselineNominalPf: number;
  parasiticOffsetPf: number;
  driftPf: number;
  cleanDeltaPf: number; // Ideal finger delta (no noise/coupling/parasitics/drift)
  distortedDeltaPf: number; // Delta after coupling + parasitics + drift + noise (before calibration)
  totalCapacitancePf: number; // Total physical capacitance C0 + parasitic + drift + coupled delta + noise
  calibratedDeltaPf: number; // After baseline subtraction
  compensatedWeightPf: number; // Final non-negative weight w_i used in improved centroid
  rawWeightPf: number; // Uncalibrated non-negative weight used in raw centroid
  weightedTermMmPf: number; // x_i * w_i
  excitationCurrentUa: number; // Conceptual AC current amplitude
  opAmpVirtualGndV: number; // Non-inverting reference V_+ ≈ V_- = V_bias (V)
  opAmpDeltaV: number; // Signal swing ΔV_opamp above V_bias (V)
  opAmpOutV: number; // Clamped op-amp output voltage (V)
  opAmpIdealOutV: number; // Unclamped ideal output (V)
  opAmpGainVPerPf: number; // Effective op-amp sensitivity (V/pF)
  opAmpSaturated: boolean; // True when op-amp clips near supply rails
  conditionedVoltageV: number; // Analog conditioned stage output
  adcCounts: number; // Quantized ADC reading
}

export interface CentroidEstimate {
  detected: boolean;
  positionMm: number | null;
  sumWeightsPf: number;
  sumWeightedPositionsMmPf: number;
  errorMm: number | null; // |estimated - actual|
  falseTouch: boolean;
  missedTouch: boolean;
}

export interface TwinComparisonResult {
  electrodeCount: ElectrodeCount;
  positionMm: number | null;
  errorMm: number | null;
  detected: boolean;
  channelWeights: { label: string; centerMm: number; weightPf: number }[];
}

export interface SimulationTickOutput {
  timestampSec: number;
  channels: ElectrodeChannelSnapshot[];
  strongestChannelIndex: number;
  totalCleanDeltaPf: number;
  totalDistortedDeltaPf: number;
  rawEstimate: CentroidEstimate;
  improvedEstimate: CentroidEstimate;
  twin3Electrode: TwinComparisonResult;
  twin6Electrode: TwinComparisonResult;
}

export interface HistorySample {
  t: number;
  actualXMm: number;
  isTouching: boolean;
  rawPosMm: number | null;
  improvedPosMm: number | null;
  rawErrorMm: number | null;
  improvedErrorMm: number | null;
  pos3Mm: number | null;
  pos6Mm: number | null;
  err3Mm: number | null;
  err6Mm: number | null;
  channelsPf: number[]; // Total capacitance C_i per channel
  cleanSignalsPf: number[]; // Ideal delta C_i
  distortedSignalsPf: number[]; // Distorted delta C_i
}

export interface PerformanceMetrics {
  sampleCount: number;
  rawMaeMm: number;
  improvedMaeMm: number;
  rawMaxErrorMm: number;
  improvedMaxErrorMm: number;
  rawFalseTouches: number;
  improvedFalseTouches: number;
  rawMissedTouches: number;
  improvedMissedTouches: number;
  rawStabilityStdMm: number;
  improvedStabilityStdMm: number;
}
