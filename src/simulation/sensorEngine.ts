import {
  AlgorithmParams,
  CentroidEstimate,
  ElectrodeChannelSnapshot,
  ElectrodeCount,
  ElectronicsParams,
  FingerState,
  NonIdealityParams,
  PerformanceMetrics,
  HistorySample,
  SensorGeometry,
  SimulationTickOutput,
  TwinComparisonResult,
} from './types';

// Nominal illustrative baseline pad capacitance (pF)
export const NOMINAL_BASE_CAP_PF = 12.0;

// Deterministic parasitic imbalance pattern (illustrative PCB trace asymmetry)
const PARASITIC_PATTERN = [-0.62, 0.95, -0.38, 1.18, -0.74, 0.49];

// Slight deterministic sensitivity variation across pads (+/- 4%)
const GAIN_VARIATION = [0.98, 1.02, 0.99, 1.03, 0.97, 1.01];

/**
 * Abramowitz & Stegun 7.1.26 rational approximation for erf(x).
 * Deterministic and fast (~1.5e-7 max error).
 */
export function erfApprox(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return sign * y;
}

/**
 * Deterministic Box-Muller pseudo-random Gaussian sample using a linear congruential step.
 */
export function nextGaussian(seedRef: { state: number }): number {
  const next = () => {
    seedRef.state = (seedRef.state * 1664525 + 1013904223) >>> 0;
    return (seedRef.state + 0.5) / 4294967296;
  };
  const u1 = Math.max(1e-7, next());
  const u2 = next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Computes electrode physical centers and widths (in mm) along [0, sliderLengthMm].
 */
export function computeElectrodeLayout(
  count: ElectrodeCount,
  sliderLengthMm: number,
  gapMm: number
): { index: number; label: string; centerMm: number; widthMm: number; startMm: number; endMm: number }[] {
  const safeGap = Math.min(gapMm, (sliderLengthMm * 0.4) / Math.max(1, count - 1));
  const totalGaps = safeGap * (count - 1);
  const widthMm = (sliderLengthMm - totalGaps) / count;
  const result = [];
  for (let i = 0; i < count; i++) {
    const startMm = i * (widthMm + safeGap);
    const endMm = startMm + widthMm;
    result.push({
      index: i,
      label: `E${i + 1}`,
      centerMm: startMm + widthMm * 0.5,
      widthMm,
      startMm,
      endMm,
    });
  }
  return result;
}

/**
 * Evaluates spatial sensitivity S_i(x) for an electrode spanning [startMm, endMm]
 * given finger position xMm and effective field spread sigmaMm.
 * Uses integrated Gaussian overlap plus small fringing tail.
 */
export function evaluateSpatialSensitivity(
  xMm: number,
  startMm: number,
  endMm: number,
  sigmaMm: number
): number {
  const invSqrt2Sigma = 1 / (Math.SQRT2 * Math.max(1.5, sigmaMm));
  const overlap =
    0.5 * (erfApprox((endMm - xMm) * invSqrt2Sigma) - erfApprox((startMm - xMm) * invSqrt2Sigma));
  // Normalize relative to a nominal reference pad width (~13.8 mm) so 3-electrode pads don't artificially drop peak
  const padWidth = Math.max(4, endMm - startMm);
  const centerSample =
    0.5 *
    (erfApprox((padWidth * 0.5) * invSqrt2Sigma) - erfApprox((-padWidth * 0.5) * invSqrt2Sigma));
  const normalized = centerSample > 1e-4 ? overlap / centerSample : 0;
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Computes dielectric coupling amplitude (pF) as a function of overlay thickness,
 * relative permittivity, and finger hover height (air gap).
 * Illustrative lumped physical scaling: C_eff ~ 1 / (d_ov / eps_r + h_air / 1.0)
 */
export function computeCouplingPeakPf(
  overlayThicknessMm: number,
  overlayPermittivity: number,
  fingerHeightMm: number
): number {
  const dRef = 1.0 / 3.8; // Nominal 1.0 mm acrylic/FR4 solder mask reference
  const dEff =
    Math.max(0.1, overlayThicknessMm) / Math.max(1.0, overlayPermittivity) +
    Math.max(0, fingerHeightMm);
  const ratio = dRef / dEff;
  // Peak finger-to-pad coupling ~2.20 pF at nominal contact, saturates softly for ultra-thin overlays
  return 2.2 * Math.min(2.6, Math.pow(ratio, 0.92));
}

/**
 * Evaluates ideal (clean) delta C_i across all electrodes for 1 or 2 fingers.
 */
export function computeCleanDeltas(
  count: ElectrodeCount,
  geometry: SensorGeometry,
  finger: FingerState
): { sensitivities: number[]; cleanDeltas: number[] } {
  const layout = computeElectrodeLayout(count, geometry.sliderLengthMm, geometry.electrodeGapMm);
  const sigmaEff = Math.sqrt(
    geometry.fingerRadiusMm * geometry.fingerRadiusMm +
      0.65 * Math.pow(geometry.overlayThicknessMm + finger.heightMm, 2)
  );
  const peakPf = computeCouplingPeakPf(
    geometry.overlayThicknessMm,
    geometry.overlayPermittivity,
    finger.heightMm
  );

  // If finger is lifted very far (> 15 mm) and not touching, coupling approaches 0
  const proximityFactor = finger.isTouching
    ? 1.0
    : Math.max(0, Math.exp(-finger.heightMm / 6.5));

  const sensitivities: number[] = [];
  const cleanDeltas: number[] = [];

  for (let i = 0; i < count; i++) {
    const pad = layout[i];
    const s1 = evaluateSpatialSensitivity(finger.xMm, pad.startMm, pad.endMm, sigmaEff);
    let sTotal = s1;
    if (finger.secondFingerEnabled) {
      const s2 = evaluateSpatialSensitivity(
        finger.secondFingerXMm,
        pad.startMm,
        pad.endMm,
        sigmaEff
      );
      // Two-finger capacitive superposition (saturates softly)
      sTotal = Math.min(1.35, s1 + s2);
    }
    sensitivities.push(s1);
    const gain = count === 6 ? GAIN_VARIATION[i] : (GAIN_VARIATION[i * 2] + GAIN_VARIATION[i * 2 + 1]) * 0.5;
    cleanDeltas.push(peakPf * proximityFactor * sTotal * gain);
  }

  return { sensitivities, cleanDeltas };
}

/**
 * Applies nearest-neighbor capacitive crosstalk matrix M * delta.
 */
export function applyAdjacentCoupling(deltas: number[], alpha: number): number[] {
  const n = deltas.length;
  if (alpha <= 0 || n < 2) return [...deltas];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const left = i > 0 ? deltas[i - 1] : 0;
    const right = i < n - 1 ? deltas[i + 1] : 0;
    const neighborWeight = i === 0 || i === n - 1 ? alpha * 0.5 : alpha;
    out[i] = (1 - neighborWeight) * deltas[i] + (alpha * 0.5) * (left + right);
  }
  return out;
}

/**
 * First-order tridiagonal deconvolution to compensate adjacent-electrode coupling.
 */
export function compensateCoupling(
  deltas: number[],
  alpha: number,
  strength: number
): number[] {
  const n = deltas.length;
  const effAlpha = Math.min(0.42, alpha * strength);
  if (effAlpha <= 0.005 || n < 2) return [...deltas];

  // Solve M * x = deltas via Gauss-Seidel iterations (well-conditioned for alpha < 0.45)
  const x = [...deltas];
  for (let iter = 0; iter < 10; iter++) {
    for (let i = 0; i < n; i++) {
      const left = i > 0 ? x[i - 1] : 0;
      const right = i < n - 1 ? x[i + 1] : 0;
      const diag = i === 0 || i === n - 1 ? 1 - effAlpha * 0.5 : 1 - effAlpha;
      x[i] = (deltas[i] - effAlpha * 0.5 * (left + right)) / Math.max(0.25, diag);
    }
  }
  return x.map((v) => Math.max(0, v));
}

export interface EngineFilterState {
  emaPositionMm: number | null;
  emaWeights: number[];
  maPositionWindow: number[];
  calibratedBaselinePf: number[];
  noiseSeed: { state: number };
}

export function createInitialFilterState(count: ElectrodeCount = 6): EngineFilterState {
  return {
    emaPositionMm: null,
    emaWeights: new Array(count).fill(0),
    maPositionWindow: [],
    calibratedBaselinePf: new Array(count).fill(NOMINAL_BASE_CAP_PF),
    noiseSeed: { state: 133742 },
  };
}

/**
 * Computes centroid estimate from channel weights and positions.
 */
function computeWeightedCentroid(
  centersMm: number[],
  weightsPf: number[],
  thresholdPf: number,
  actualXMm: number,
  actualIsTouching: boolean
): CentroidEstimate {
  let sumW = 0;
  let sumXW = 0;
  for (let i = 0; i < centersMm.length; i++) {
    const w = Math.max(0, weightsPf[i]);
    sumW += w;
    sumXW += centersMm[i] * w;
  }

  const detected = sumW >= thresholdPf;
  const positionMm = detected && sumW > 1e-6 ? sumXW / sumW : null;
  const errorMm = detected && positionMm !== null ? Math.abs(positionMm - actualXMm) : null;
  const falseTouch = !actualIsTouching && detected;
  const missedTouch = actualIsTouching && !detected;

  return {
    detected,
    positionMm,
    sumWeightsPf: sumW,
    sumWeightedPositionsMmPf: sumXW,
    errorMm,
    falseTouch,
    missedTouch,
  };
}

/**
 * Executes one deterministic (when noise = 0) tick of the central simulation engine.
 */
export function stepSensorSimulation(
  timestampSec: number,
  geometry: SensorGeometry,
  finger: FingerState,
  nonIdealities: NonIdealityParams,
  electronics: ElectronicsParams,
  algorithm: AlgorithmParams,
  filterState: EngineFilterState,
  advanceNoise: boolean
): SimulationTickOutput {
  const count = geometry.electrodeCount;
  const layout = computeElectrodeLayout(count, geometry.sliderLengthMm, geometry.electrodeGapMm);

  // Ensure filterState arrays match electrode count
  if (filterState.calibratedBaselinePf.length !== count) {
    filterState.calibratedBaselinePf = new Array(count).fill(NOMINAL_BASE_CAP_PF);
    filterState.emaWeights = new Array(count).fill(0);
    filterState.emaPositionMm = null;
    filterState.maPositionWindow = [];
  }

  const { sensitivities, cleanDeltas } = computeCleanDeltas(count, geometry, finger);

  // Adjacent coupling
  const alphaCoupling = nonIdealities.couplingEnabled ? nonIdealities.couplingCoeff : 0;
  const coupledDeltas = applyAdjacentCoupling(cleanDeltas, alphaCoupling);

  // Parasitics, drift, and noise per channel
  const parasiticOffsets: number[] = [];
  const drifts: number[] = [];
  const noises: number[] = [];
  const totalCaps: number[] = [];
  const distortedDeltas: number[] = [];
  const calibratedDeltas: number[] = [];

  for (let i = 0; i < count; i++) {
    const pat =
      count === 6
        ? PARASITIC_PATTERN[i]
        : (PARASITIC_PATTERN[i * 2] - PARASITIC_PATTERN[i * 2 + 1]) * 0.7;

    const parasiticPf = nonIdealities.parasiticsEnabled
      ? pat * nonIdealities.parasiticSpreadPf
      : 0;

    // Slow multi-frequency thermal/humidity drift (pF)
    const driftPf = nonIdealities.driftEnabled
      ? nonIdealities.driftAmplitudePf *
        (0.65 * Math.sin(timestampSec * 0.35 + i * 0.9) +
          0.35 * Math.cos(timestampSec * 0.14 - i * 0.5) +
          0.2 * ((i % 2 === 0 ? 1 : -1) * Math.min(1, timestampSec * 0.015)))
      : 0;

    // Deterministic zero when noise disabled
    let noisePf = 0;
    if (nonIdealities.noiseEnabled && nonIdealities.noiseAmplitudePf > 0) {
      if (advanceNoise) {
        noisePf = nextGaussian(filterState.noiseSeed) * nonIdealities.noiseAmplitudePf;
      } else {
        // Deterministic static sample from timestamp when paused
        const pseudo = Math.sin(timestampSec * 37.7 + i * 19.3) * 0.7 + Math.cos(timestampSec * 13.1 + i * 7.9) * 0.3;
        noisePf = pseudo * nonIdealities.noiseAmplitudePf;
      }
    }

    const totalCapPf =
      NOMINAL_BASE_CAP_PF + parasiticPf + driftPf + coupledDeltas[i] + noisePf;
    const distortedDeltaPf = totalCapPf - NOMINAL_BASE_CAP_PF;
    const calibratedDeltaPf = totalCapPf - filterState.calibratedBaselinePf[i];

    parasiticOffsets.push(parasiticPf);
    drifts.push(driftPf);
    noises.push(noisePf);
    totalCaps.push(totalCapPf);
    distortedDeltas.push(distortedDeltaPf);
    calibratedDeltas.push(calibratedDeltaPf);
  }

  // Optional auto baseline tracking when no touch is clearly present
  if (algorithm.autoBaselineTracking && !finger.isTouching && finger.heightMm > 2.5) {
    for (let i = 0; i < count; i++) {
      filterState.calibratedBaselinePf[i] =
        filterState.calibratedBaselinePf[i] * 0.97 + totalCaps[i] * 0.03;
    }
  }

  // Raw weights (uncalibrated, uncompensated, unfiltered, simple deadband)
  const rawWeights = distortedDeltas.map((d) => Math.max(0, d - 0.08));

  // Improved weights: baseline subtracted -> coupling compensation -> noise floor -> temporal filter
  const deCoupled = algorithm.couplingCompensation
    ? compensateCoupling(
        calibratedDeltas.map((d) => Math.max(0, d)),
        alphaCoupling,
        algorithm.compensationStrength
      )
    : calibratedDeltas.map((d) => Math.max(0, d));

  const flooredWeights = deCoupled.map((d) => Math.max(0, d - algorithm.channelNoiseFloorPf));

  // Apply channel EMA if EMA filter is selected
  let finalWeights: number[];
  if (algorithm.filterType === 'ema') {
    finalWeights = flooredWeights.map((w, idx) => {
      const prev = filterState.emaWeights[idx] ?? w;
      const next = algorithm.emaAlpha * w + (1 - algorithm.emaAlpha) * prev;
      filterState.emaWeights[idx] = next;
      return next;
    });
  } else {
    filterState.emaWeights = [...flooredWeights];
    finalWeights = flooredWeights;
  }

  const centersMm = layout.map((l) => l.centerMm);

  const rawEstimate = computeWeightedCentroid(
    centersMm,
    rawWeights,
    algorithm.touchThresholdPf,
    finger.xMm,
    finger.isTouching
  );

  let improvedEstimate = computeWeightedCentroid(
    centersMm,
    finalWeights,
    algorithm.touchThresholdPf,
    finger.xMm,
    finger.isTouching
  );

  // Position-level moving average or EMA smoothing if active
  if (improvedEstimate.detected && improvedEstimate.positionMm !== null) {
    let smoothedPos = improvedEstimate.positionMm;
    if (algorithm.filterType === 'ema') {
      if (filterState.emaPositionMm !== null) {
        smoothedPos =
          algorithm.emaAlpha * improvedEstimate.positionMm +
          (1 - algorithm.emaAlpha) * filterState.emaPositionMm;
      }
      filterState.emaPositionMm = smoothedPos;
    } else if (algorithm.filterType === 'moving_avg') {
      filterState.maPositionWindow.push(improvedEstimate.positionMm);
      if (filterState.maPositionWindow.length > algorithm.movingAvgWindow) {
        filterState.maPositionWindow.shift();
      }
      const sum = filterState.maPositionWindow.reduce((a, b) => a + b, 0);
      smoothedPos = sum / filterState.maPositionWindow.length;
    } else {
      filterState.emaPositionMm = smoothedPos;
      filterState.maPositionWindow = [smoothedPos];
    }

    improvedEstimate = {
      ...improvedEstimate,
      positionMm: smoothedPos,
      errorMm: Math.abs(smoothedPos - finger.xMm),
    };
  } else {
    filterState.emaPositionMm = null;
    filterState.maPositionWindow = [];
  }

  // Electronics readout calculation per channel
  const adcMax = Math.pow(2, electronics.adcBits) - 1;
  const omega = 2 * Math.PI * electronics.excitationFreqKHz * 1e3;

  const channels: ElectrodeChannelSnapshot[] = layout.map((pad, i) => {
    const capFarads = totalCaps[i] * 1e-12;
    const iPeakUa = omega * (electronics.excitationVoltageV * 0.5) * capFarads * 1e6;
    // Conditioned voltage scales with delta capacitance + offset above virtual ground
    const vCond = Math.min(
      electronics.vRef,
      Math.max(
        0,
        0.35 +
          (calibratedDeltas[i] + 0.3) *
            electronics.readoutGain *
            (electronics.excitationVoltageV / 3.3) *
            (0.6 + 0.4 * (electronics.excitationFreqKHz / 250))
      )
    );
    const adcCounts = Math.round(Math.min(adcMax, Math.max(0, (vCond / electronics.vRef) * adcMax)));

    return {
      index: i,
      label: pad.label,
      centerMm: pad.centerMm,
      widthMm: pad.widthMm,
      spatialSensitivity: sensitivities[i],
      baselineNominalPf: NOMINAL_BASE_CAP_PF,
      parasiticOffsetPf: parasiticOffsets[i],
      driftPf: drifts[i],
      cleanDeltaPf: cleanDeltas[i],
      distortedDeltaPf: distortedDeltas[i],
      totalCapacitancePf: totalCaps[i],
      calibratedDeltaPf: calibratedDeltas[i],
      compensatedWeightPf: finalWeights[i],
      rawWeightPf: rawWeights[i],
      weightedTermMmPf: pad.centerMm * finalWeights[i],
      excitationCurrentUa: iPeakUa,
      conditionedVoltageV: vCond,
      adcCounts,
    };
  });

  // Strongest responding channel
  let strongestChannelIndex = 0;
  let maxVal = -Infinity;
  for (let i = 0; i < channels.length; i++) {
    if (channels[i].compensatedWeightPf > maxVal) {
      maxVal = channels[i].compensatedWeightPf;
      strongestChannelIndex = i;
    }
  }

  // Synchronized 3-vs-6 electrode twin calculation (clean + coupling + noise scaled deterministically)
  const computeTwin = (targetCount: ElectrodeCount): TwinComparisonResult => {
    const twinLayout = computeElectrodeLayout(
      targetCount,
      geometry.sliderLengthMm,
      geometry.electrodeGapMm
    );
    const { cleanDeltas: twinClean } = computeCleanDeltas(targetCount, geometry, finger);
    const twinCoupled = applyAdjacentCoupling(twinClean, alphaCoupling);
    const twinDeCoupled = algorithm.couplingCompensation
      ? compensateCoupling(twinCoupled, alphaCoupling, algorithm.compensationStrength)
      : twinCoupled;
    const twinWeights = twinDeCoupled.map((w) => Math.max(0, w - algorithm.channelNoiseFloorPf));
    const est = computeWeightedCentroid(
      twinLayout.map((l) => l.centerMm),
      twinWeights,
      algorithm.touchThresholdPf,
      finger.xMm,
      finger.isTouching
    );
    return {
      electrodeCount: targetCount,
      positionMm: est.positionMm,
      errorMm: est.errorMm,
      detected: est.detected,
      channelWeights: twinLayout.map((l, idx) => ({
        label: l.label,
        centerMm: l.centerMm,
        weightPf: twinWeights[idx],
      })),
    };
  };

  const twin3Electrode = computeTwin(3);
  const twin6Electrode = computeTwin(6);

  return {
    timestampSec,
    channels,
    strongestChannelIndex,
    totalCleanDeltaPf: cleanDeltas.reduce((a, b) => a + b, 0),
    totalDistortedDeltaPf: distortedDeltas.reduce((a, b) => a + b, 0),
    rawEstimate,
    improvedEstimate,
    twin3Electrode,
    twin6Electrode,
  };
}

/**
 * Computes aggregate performance metrics over recorded history samples.
 */
export function computePerformanceMetrics(history: HistorySample[]): PerformanceMetrics {
  if (history.length === 0) {
    return {
      sampleCount: 0,
      rawMaeMm: 0,
      improvedMaeMm: 0,
      rawMaxErrorMm: 0,
      improvedMaxErrorMm: 0,
      rawFalseTouches: 0,
      improvedFalseTouches: 0,
      rawMissedTouches: 0,
      improvedMissedTouches: 0,
      rawStabilityStdMm: 0,
      improvedStabilityStdMm: 0,
    };
  }

  let rawErrSum = 0;
  let rawErrCount = 0;
  let impErrSum = 0;
  let impErrCount = 0;
  let rawMax = 0;
  let impMax = 0;
  let rawFalse = 0;
  let impFalse = 0;
  let rawMissed = 0;
  let impMissed = 0;

  const rawErrors: number[] = [];
  const impErrors: number[] = [];

  for (const s of history) {
    if (s.isTouching) {
      if (s.rawPosMm === null) {
        rawMissed++;
      } else if (s.rawErrorMm !== null) {
        rawErrSum += s.rawErrorMm;
        rawErrCount++;
        rawMax = Math.max(rawMax, s.rawErrorMm);
        rawErrors.push(s.rawErrorMm);
      }

      if (s.improvedPosMm === null) {
        impMissed++;
      } else if (s.improvedErrorMm !== null) {
        impErrSum += s.improvedErrorMm;
        impErrCount++;
        impMax = Math.max(impMax, s.improvedErrorMm);
        impErrors.push(s.improvedErrorMm);
      }
    } else {
      if (s.rawPosMm !== null) rawFalse++;
      if (s.improvedPosMm !== null) impFalse++;
    }
  }

  const calcStd = (arr: number[]) => {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  };

  return {
    sampleCount: history.length,
    rawMaeMm: rawErrCount > 0 ? rawErrSum / rawErrCount : 0,
    improvedMaeMm: impErrCount > 0 ? impErrSum / impErrCount : 0,
    rawMaxErrorMm: rawMax,
    improvedMaxErrorMm: impMax,
    rawFalseTouches: rawFalse,
    improvedFalseTouches: impFalse,
    rawMissedTouches: rawMissed,
    improvedMissedTouches: impMissed,
    rawStabilityStdMm: calcStd(rawErrors),
    improvedStabilityStdMm: calcStd(impErrors),
  };
}
