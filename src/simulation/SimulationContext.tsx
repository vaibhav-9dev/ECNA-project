import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlgorithmParams,
  CameraPreset,
  ElectrodeCount,
  ElectronicsParams,
  FingerState,
  HistorySample,
  NavSection,
  NonIdealityParams,
  PerformanceMetrics,
  SensorGeometry,
  SimulationTickOutput,
  TouchMode,
} from './types';
import {
  computePerformanceMetrics,
  createInitialFilterState,
  EngineFilterState,
  NOMINAL_BASE_CAP_PF,
  stepSensorSimulation,
} from './sensorEngine';

const DEFAULT_GEOMETRY: SensorGeometry = {
  electrodeCount: 6,
  sliderLengthMm: 90,
  sliderWidthMm: 18,
  electrodeGapMm: 1.2,
  overlayThicknessMm: 1.0,
  overlayPermittivity: 3.8,
  pcbThicknessMm: 1.6,
  fingerRadiusMm: 7.5,
};

const DEFAULT_FINGER: FingerState = {
  xMm: 36,
  heightMm: 0.0,
  isTouching: true,
  secondFingerEnabled: false,
  secondFingerXMm: 66,
};

const DEFAULT_NON_IDEALITIES: NonIdealityParams = {
  noiseEnabled: false,
  noiseAmplitudePf: 0.08,
  couplingEnabled: false,
  couplingCoeff: 0.18,
  parasiticsEnabled: false,
  parasiticSpreadPf: 1.0,
  driftEnabled: false,
  driftAmplitudePf: 0.25,
};

const DEFAULT_ELECTRONICS: ElectronicsParams = {
  excitationFreqKHz: 200,
  excitationVoltageV: 3.3,
  readoutGain: 1.2,
  adcBits: 12,
  vRef: 3.3,
};

const DEFAULT_ALGORITHM: AlgorithmParams = {
  touchThresholdPf: 0.35,
  channelNoiseFloorPf: 0.04,
  filterType: 'ema',
  emaAlpha: 0.35,
  movingAvgWindow: 5,
  couplingCompensation: true,
  compensationStrength: 0.85,
  autoBaselineTracking: false,
};

export interface SimulationContextValue {
  activeSection: NavSection;
  setActiveSection: (s: NavSection) => void;

  geometry: SensorGeometry;
  setGeometry: React.Dispatch<React.SetStateAction<SensorGeometry>>;
  setElectrodeCount: (count: ElectrodeCount) => void;

  finger: FingerState;
  setFinger: React.Dispatch<React.SetStateAction<FingerState>>;
  touchMode: TouchMode;
  setTouchMode: (mode: TouchMode) => void;

  nonIdealities: NonIdealityParams;
  setNonIdealities: React.Dispatch<React.SetStateAction<NonIdealityParams>>;
  enableAllNonIdealities: (enabled: boolean) => void;

  electronics: ElectronicsParams;
  setElectronics: React.Dispatch<React.SetStateAction<ElectronicsParams>>;

  algorithm: AlgorithmParams;
  setAlgorithm: React.Dispatch<React.SetStateAction<AlgorithmParams>>;

  // 3D View controls
  explodedFactor: number;
  setExplodedFactor: (v: number) => void;
  showFieldLines: boolean;
  setShowFieldLines: (v: boolean) => void;
  showCrossSection: boolean;
  setShowCrossSection: (v: boolean) => void;
  cameraPreset: CameraPreset;
  setCameraPreset: (p: CameraPreset) => void;
  cameraResetCounter: number;
  triggerCameraReset: () => void;
  isFullscreen3D: boolean;
  setIsFullscreen3D: (v: boolean) => void;
  isDraggingFinger: boolean;
  setIsDraggingFinger: (v: boolean) => void;

  // Transport controls
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  simSpeed: number;
  setSimSpeed: (v: number) => void;
  isReplaying: boolean;
  startReplay: () => void;
  stopReplay: () => void;
  resetSimulation: () => void;
  calibrateBaseline: () => void;
  lastCalibratedAtSec: number | null;
  calibratedBaselinePf: number[];

  // Outputs
  tickOutput: SimulationTickOutput;
  history: HistorySample[];
  metrics: PerformanceMetrics;

  // Guided Experiment helper
  activeExperimentId: string | null;
  applyExperimentPreset: (experimentId: string) => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

const MAX_HISTORY_SAMPLES = 180;

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSection, setActiveSection] = useState<NavSection>('sensor-3d');
  const [geometry, setGeometry] = useState<SensorGeometry>(DEFAULT_GEOMETRY);
  const [finger, setFinger] = useState<FingerState>(DEFAULT_FINGER);
  const [touchMode, setTouchModeState] = useState<TouchMode>('manual');
  const [nonIdealities, setNonIdealities] = useState<NonIdealityParams>(DEFAULT_NON_IDEALITIES);
  const [electronics, setElectronics] = useState<ElectronicsParams>(DEFAULT_ELECTRONICS);
  const [algorithm, setAlgorithm] = useState<AlgorithmParams>(DEFAULT_ALGORITHM);

  const [explodedFactor, setExplodedFactor] = useState<number>(0);
  const [showFieldLines, setShowFieldLines] = useState<boolean>(true);
  const [showCrossSection, setShowCrossSection] = useState<boolean>(false);
  const [cameraPreset, setCameraPresetState] = useState<CameraPreset>('perspective');
  const [cameraResetCounter, setCameraResetCounter] = useState<number>(0);
  const [isFullscreen3D, setIsFullscreen3D] = useState<boolean>(false);
  const [isDraggingFinger, setIsDraggingFinger] = useState<boolean>(false);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [lastCalibratedAtSec, setLastCalibratedAtSec] = useState<number | null>(null);
  const [activeExperimentId, setActiveExperimentId] = useState<string | null>(null);

  const filterStateRef = useRef<EngineFilterState>(createInitialFilterState(DEFAULT_GEOMETRY.electrodeCount));
  const simTimeRef = useRef<number>(0);
  const replayIndexRef = useRef<number>(0);
  const replayBufferRef = useRef<HistorySample[]>([]);
  const skipNextEffectRef = useRef<boolean>(false);

  // Initial synchronous snapshot
  const [tickOutput, setTickOutput] = useState<SimulationTickOutput>(() =>
    stepSensorSimulation(
      0,
      DEFAULT_GEOMETRY,
      DEFAULT_FINGER,
      DEFAULT_NON_IDEALITIES,
      DEFAULT_ELECTRONICS,
      DEFAULT_ALGORITHM,
      filterStateRef.current,
      false
    )
  );
  const [history, setHistory] = useState<HistorySample[]>([]);

  // Keep latest state in refs for smooth simulation interval without recreating timers
  const stateRefs = useRef({
    geometry,
    finger,
    touchMode,
    nonIdealities,
    electronics,
    algorithm,
    isPlaying,
    simSpeed,
    isReplaying,
    isDraggingFinger,
  });

  stateRefs.current = {
    geometry,
    finger,
    touchMode,
    nonIdealities,
    electronics,
    algorithm,
    isPlaying,
    simSpeed,
    isReplaying,
    isDraggingFinger,
  };

  const setCameraPreset = useCallback((p: CameraPreset) => {
    setCameraPresetState(p);
    setShowCrossSection(p === 'cross-section');
    setCameraResetCounter((c) => c + 1);
  }, []);

  const triggerCameraReset = useCallback(() => {
    setCameraPresetState('perspective');
    setShowCrossSection(false);
    setCameraResetCounter((c) => c + 1);
  }, []);

  const setElectrodeCount = useCallback((count: ElectrodeCount) => {
    setGeometry((prev) => ({ ...prev, electrodeCount: count }));
    filterStateRef.current = createInitialFilterState(count);
    setLastCalibratedAtSec(null);
  }, []);

  const setTouchMode = useCallback((mode: TouchMode) => {
    setTouchModeState(mode);
    setFinger((prev) => {
      switch (mode) {
        case 'hover':
          return { ...prev, heightMm: 3.5, isTouching: false, secondFingerEnabled: false };
        case 'touch':
        case 'hold':
          return { ...prev, heightMm: 0.0, isTouching: true, secondFingerEnabled: false };
        case 'fast':
        case 'slow':
          return { ...prev, heightMm: 0.0, isTouching: true, secondFingerEnabled: false };
        case 'double':
          return {
            ...prev,
            xMm: Math.min(prev.xMm, stateRefs.current.geometry.sliderLengthMm * 0.38),
            heightMm: 0.0,
            isTouching: true,
            secondFingerEnabled: true,
            secondFingerXMm: stateRefs.current.geometry.sliderLengthMm * 0.72,
          };
        case 'manual':
        default:
          return { ...prev, secondFingerEnabled: false };
      }
    });
  }, []);

  const enableAllNonIdealities = useCallback((enabled: boolean) => {
    setNonIdealities((prev) => ({
      ...prev,
      noiseEnabled: enabled,
      couplingEnabled: enabled,
      parasiticsEnabled: enabled,
      driftEnabled: enabled,
    }));
  }, []);

  const calibrateBaseline = useCallback(() => {
    const snap = stepSensorSimulation(
      simTimeRef.current,
      stateRefs.current.geometry,
      { ...stateRefs.current.finger, isTouching: false, heightMm: 20 },
      stateRefs.current.nonIdealities,
      stateRefs.current.electronics,
      stateRefs.current.algorithm,
      filterStateRef.current,
      false
    );
    filterStateRef.current.calibratedBaselinePf = snap.channels.map((ch) => ch.totalCapacitancePf);
    setLastCalibratedAtSec(simTimeRef.current);
  }, []);

  const resetSimulation = useCallback(() => {
    setIsReplaying(false);
    simTimeRef.current = 0;
    filterStateRef.current = createInitialFilterState(stateRefs.current.geometry.electrodeCount);
    setLastCalibratedAtSec(null);
    setHistory([]);
    const out = stepSensorSimulation(
      0,
      stateRefs.current.geometry,
      stateRefs.current.finger,
      stateRefs.current.nonIdealities,
      stateRefs.current.electronics,
      stateRefs.current.algorithm,
      filterStateRef.current,
      false
    );
    setTickOutput(out);
  }, []);

  const startReplay = useCallback(() => {
    if (history.length < 2) return;
    replayBufferRef.current = [...history];
    replayIndexRef.current = 0;
    setIsReplaying(true);
    setIsPlaying(true);
  }, [history]);

  const stopReplay = useCallback(() => {
    setIsReplaying(false);
  }, []);

  // Recompute immediately when user tweaks manual parameters while paused or dragging
  useEffect(() => {
    if (isReplaying) return;
    if (skipNextEffectRef.current) {
      skipNextEffectRef.current = false;
      return;
    }
    const out = stepSensorSimulation(
      simTimeRef.current,
      geometry,
      finger,
      nonIdealities,
      electronics,
      algorithm,
      filterStateRef.current,
      false
    );
    setTickOutput(out);
  }, [geometry, finger, nonIdealities, electronics, algorithm, isReplaying]);

  // Main real-time simulation loop (20 Hz telemetry sampling)
  useEffect(() => {
    const intervalMs = 50;
    const timer = window.setInterval(() => {
      const s = stateRefs.current;
      if (!s.isPlaying) return;

      const dt = (intervalMs / 1000) * s.simSpeed;

      // Replay mode plays back recorded history trace
      if (s.isReplaying) {
        const buf = replayBufferRef.current;
        if (buf.length === 0) {
          setIsReplaying(false);
          return;
        }
        const idx = replayIndexRef.current % buf.length;
        const sample = buf[idx];
        replayIndexRef.current = idx + 1;
        if (idx === buf.length - 1) {
          setIsReplaying(false);
        }
        setFinger((prev) => ({
          ...prev,
          xMm: sample.actualXMm,
          isTouching: sample.isTouching,
          heightMm: sample.isTouching ? 0 : 4.0,
        }));
        return;
      }

      simTimeRef.current += dt;
      const t = simTimeRef.current;

      // Motion modes when not manually dragging on the 3D surface
      let activeFinger = s.finger;
      if (!s.isDraggingFinger && s.touchMode !== 'manual' && s.touchMode !== 'hold') {
        const L = s.geometry.sliderLengthMm;
        const margin = 6;
        const span = Math.max(10, L - 2 * margin);
        if (s.touchMode === 'slow') {
          const x = margin + span * (0.5 + 0.5 * Math.sin(t * 0.55));
          activeFinger = { ...s.finger, xMm: x, isTouching: true, heightMm: 0 };
        } else if (s.touchMode === 'fast') {
          const cycle = (t * 1.9) % (2 * Math.PI);
          const x = margin + span * (0.5 + 0.5 * Math.sin(cycle));
          // Brief lift near turnaround to demonstrate release/touch transitions
          const lifted = Math.abs(Math.sin(cycle)) > 0.96;
          activeFinger = {
            ...s.finger,
            xMm: x,
            isTouching: !lifted,
            heightMm: lifted ? 3.2 : 0,
          };
        } else if (s.touchMode === 'hover') {
          const x = margin + span * (0.5 + 0.5 * Math.sin(t * 0.7));
          activeFinger = { ...s.finger, xMm: x, isTouching: false, heightMm: 3.5 };
        } else if (s.touchMode === 'touch') {
          const x = margin + span * (0.5 + 0.42 * Math.sin(t * 0.8));
          activeFinger = { ...s.finger, xMm: x, isTouching: true, heightMm: 0 };
        } else if (s.touchMode === 'double') {
          const x1 = margin + span * 0.25 + span * 0.12 * Math.sin(t * 0.6);
          const x2 = L - margin - span * 0.25 - span * 0.12 * Math.sin(t * 0.6);
          activeFinger = {
            ...s.finger,
            xMm: x1,
            secondFingerEnabled: true,
            secondFingerXMm: x2,
            isTouching: true,
            heightMm: 0,
          };
        }
        skipNextEffectRef.current = true;
        setFinger(activeFinger);
      }

      const out = stepSensorSimulation(
        t,
        s.geometry,
        activeFinger,
        s.nonIdealities,
        s.electronics,
        s.algorithm,
        filterStateRef.current,
        true
      );
      setTickOutput(out);

      const newSample: HistorySample = {
        t: Number(t.toFixed(2)),
        actualXMm: activeFinger.xMm,
        isTouching: activeFinger.isTouching,
        rawPosMm: out.rawEstimate.positionMm,
        improvedPosMm: out.improvedEstimate.positionMm,
        rawErrorMm: out.rawEstimate.errorMm,
        improvedErrorMm: out.improvedEstimate.errorMm,
        pos3Mm: out.twin3Electrode.positionMm,
        pos6Mm: out.twin6Electrode.positionMm,
        err3Mm: out.twin3Electrode.errorMm,
        err6Mm: out.twin6Electrode.errorMm,
        channelsPf: out.channels.map((c) => Number(c.totalCapacitancePf.toFixed(4))),
        cleanSignalsPf: out.channels.map((c) => Number(c.cleanDeltaPf.toFixed(4))),
        distortedSignalsPf: out.channels.map((c) => Number(c.distortedDeltaPf.toFixed(4))),
      };

      setHistory((prev) => {
        const next = prev.length >= MAX_HISTORY_SAMPLES ? [...prev.slice(1), newSample] : [...prev, newSample];
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, []);

  const applyExperimentPreset = useCallback((experimentId: string) => {
    setActiveExperimentId(experimentId);
    setIsReplaying(false);
    setIsPlaying(true);

    switch (experimentId) {
      case 'exp-a-sweep':
        setGeometry({ ...DEFAULT_GEOMETRY, electrodeCount: 6 });
        setNonIdealities({ ...DEFAULT_NON_IDEALITIES });
        setAlgorithm({ ...DEFAULT_ALGORITHM, filterType: 'none', couplingCompensation: false });
        setTouchModeState('slow');
        setFinger({ ...DEFAULT_FINGER, heightMm: 0, isTouching: true, secondFingerEnabled: false });
        break;
      case 'exp-b-boundary':
        setGeometry({ ...DEFAULT_GEOMETRY, electrodeCount: 6 });
        setNonIdealities({ ...DEFAULT_NON_IDEALITIES });
        setTouchModeState('hold');
        // Exact boundary between E2 and E3 (for 90mm, gap 1.2mm -> boundary at ~29.6mm)
        setFinger({ xMm: 29.6, heightMm: 0, isTouching: true, secondFingerEnabled: false, secondFingerXMm: 66 });
        break;
      case 'exp-c-noise':
        setGeometry({ ...DEFAULT_GEOMETRY, electrodeCount: 6 });
        setNonIdealities({ ...DEFAULT_NON_IDEALITIES, noiseEnabled: true, noiseAmplitudePf: 0.22 });
        setAlgorithm({ ...DEFAULT_ALGORITHM, filterType: 'none', couplingCompensation: false });
        setTouchModeState('hold');
        setFinger({ xMm: 45, heightMm: 0, isTouching: true, secondFingerEnabled: false, secondFingerXMm: 66 });
        break;
      case 'exp-d-coupling':
        setGeometry({ ...DEFAULT_GEOMETRY, electrodeCount: 6 });
        setNonIdealities({ ...DEFAULT_NON_IDEALITIES, couplingEnabled: true, couplingCoeff: 0.36 });
        setAlgorithm({ ...DEFAULT_ALGORITHM, filterType: 'none', couplingCompensation: false });
        setTouchModeState('hold');
        setFinger({ xMm: 12, heightMm: 0, isTouching: true, secondFingerEnabled: false, secondFingerXMm: 66 });
        break;
      case 'exp-e-parasitics':
        setGeometry({ ...DEFAULT_GEOMETRY, electrodeCount: 6 });
        setNonIdealities({ ...DEFAULT_NON_IDEALITIES, parasiticsEnabled: true, parasiticSpreadPf: 1.8 });
        setAlgorithm({ ...DEFAULT_ALGORITHM, filterType: 'none', couplingCompensation: false });
        filterStateRef.current.calibratedBaselinePf = new Array(6).fill(NOMINAL_BASE_CAP_PF);
        setTouchModeState('slow');
        setFinger({ xMm: 45, heightMm: 0, isTouching: true, secondFingerEnabled: false, secondFingerXMm: 66 });
        break;
      case 'exp-f-3vs6':
        setGeometry({ ...DEFAULT_GEOMETRY, electrodeCount: 6 });
        setNonIdealities({ ...DEFAULT_NON_IDEALITIES });
        setAlgorithm({ ...DEFAULT_ALGORITHM, filterType: 'none' });
        setTouchModeState('slow');
        break;
      case 'exp-g-filtering':
        setGeometry({ ...DEFAULT_GEOMETRY, electrodeCount: 6 });
        setNonIdealities({
          noiseEnabled: true,
          noiseAmplitudePf: 0.2,
          couplingEnabled: true,
          couplingCoeff: 0.28,
          parasiticsEnabled: true,
          parasiticSpreadPf: 1.5,
          driftEnabled: true,
          driftAmplitudePf: 0.3,
        });
        setAlgorithm({
          ...DEFAULT_ALGORITHM,
          filterType: 'ema',
          emaAlpha: 0.25,
          couplingCompensation: true,
          compensationStrength: 0.9,
        });
        // Calibrate baseline first at no-touch so improved pipeline shines
        const snap = stepSensorSimulation(
          simTimeRef.current,
          { ...DEFAULT_GEOMETRY, electrodeCount: 6 },
          { xMm: 45, heightMm: 20, isTouching: false, secondFingerEnabled: false, secondFingerXMm: 66 },
          {
            noiseEnabled: false,
            noiseAmplitudePf: 0,
            couplingEnabled: false,
            couplingCoeff: 0,
            parasiticsEnabled: true,
            parasiticSpreadPf: 1.5,
            driftEnabled: false,
            driftAmplitudePf: 0,
          },
          stateRefs.current.electronics,
          DEFAULT_ALGORITHM,
          filterStateRef.current,
          false
        );
        filterStateRef.current.calibratedBaselinePf = snap.channels.map((c) => c.totalCapacitancePf);
        setLastCalibratedAtSec(simTimeRef.current);
        setTouchModeState('slow');
        break;
      case 'exp-hover':
        setGeometry({ ...DEFAULT_GEOMETRY, electrodeCount: 6 });
        setNonIdealities({ ...DEFAULT_NON_IDEALITIES });
        setTouchModeState('hover');
        setFinger({ xMm: 45, heightMm: 3.5, isTouching: false, secondFingerEnabled: false, secondFingerXMm: 66 });
        break;
      case 'exp-double':
        setGeometry({ ...DEFAULT_GEOMETRY, electrodeCount: 6 });
        setNonIdealities({ ...DEFAULT_NON_IDEALITIES });
        setTouchModeState('double');
        setFinger({ xMm: 24, heightMm: 0, isTouching: true, secondFingerEnabled: true, secondFingerXMm: 66 });
        break;
      default:
        break;
    }
  }, []);

  const metrics = useMemo(() => computePerformanceMetrics(history), [history]);

  const value: SimulationContextValue = {
    activeSection,
    setActiveSection,
    geometry,
    setGeometry,
    setElectrodeCount,
    finger,
    setFinger,
    touchMode,
    setTouchMode,
    nonIdealities,
    setNonIdealities,
    enableAllNonIdealities,
    electronics,
    setElectronics,
    algorithm,
    setAlgorithm,
    explodedFactor,
    setExplodedFactor,
    showFieldLines,
    setShowFieldLines,
    showCrossSection,
    setShowCrossSection,
    cameraPreset,
    setCameraPreset,
    cameraResetCounter,
    triggerCameraReset,
    isFullscreen3D,
    setIsFullscreen3D,
    isDraggingFinger,
    setIsDraggingFinger,
    isPlaying,
    setIsPlaying,
    simSpeed,
    setSimSpeed,
    isReplaying,
    startReplay,
    stopReplay,
    resetSimulation,
    calibrateBaseline,
    lastCalibratedAtSec,
    calibratedBaselinePf: filterStateRef.current.calibratedBaselinePf,
    tickOutput,
    history,
    metrics,
    activeExperimentId,
    applyExperimentPreset,
  };

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
};

export function useSimulation(): SimulationContextValue {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation must be used within a SimulationProvider');
  return ctx;
}
