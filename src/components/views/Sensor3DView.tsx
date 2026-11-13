import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { useSimulation } from '../../simulation/SimulationContext';
import { CameraPreset, TouchMode } from '../../simulation/types';
import { TouchSliderScene } from '../three/TouchSliderScene';

const TOUCH_MODES: { id: TouchMode; label: string }[] = [
  { id: 'manual', label: 'Manual Drag' },
  { id: 'touch', label: 'Touch Sweep' },
  { id: 'hover', label: 'Hover (No Contact)' },
  { id: 'hold', label: 'Hold Steady' },
  { id: 'slow', label: 'Slow Sweep' },
  { id: 'fast', label: 'Fast Sweep' },
  { id: 'double', label: 'Double Finger' },
];

const CAMERA_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'perspective', label: '3D Isometric' },
  { id: 'top', label: 'Top' },
  { id: 'side', label: 'Side' },
  { id: 'cross-section', label: 'Cross-Section' },
];

export const Sensor3DView: React.FC = () => {
  const {
    geometry,
    setGeometry,
    setElectrodeCount,
    finger,
    setFinger,
    touchMode,
    setTouchMode,
    electronics,
    setElectronics,
    setActiveSection,
    explodedFactor,
    setExplodedFactor,
    showFieldLines,
    setShowFieldLines,
    cameraPreset,
    setCameraPreset,
    triggerCameraReset,
    isFullscreen3D,
    setIsFullscreen3D,
    tickOutput,
  } = useSimulation();

  const [dockExpanded, setDockExpanded] = useState(true);
  const [telemetryOpen, setTelemetryOpen] = useState(true);
  const [dockTab, setDockTab] = useState<'interaction' | 'opamp' | 'assembly' | 'geometry'>('interaction');

  const { improvedEstimate, channels, strongestChannelIndex } = tickOutput;
  const peakCh = channels[strongestChannelIndex] ?? channels[0];
  const maxBarPf = 2.6;
  const adcMax = Math.pow(2, electronics.adcBits) - 1;

  return (
    <div
      className={`relative w-full overflow-hidden bg-[#070b12] ${
        isFullscreen3D ? 'fixed inset-0 z-50 h-screen' : 'h-[calc(100vh-53px)] min-h-[620px]'
      }`}
    >
      {/* Full-Viewport Interactive 3D Canvas */}
      <TouchSliderScene />

      {/* Top-Left Minimal Spec & Interaction Guide */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 flex flex-col gap-1.5">
        <div className="pointer-events-auto inline-flex items-center gap-3 rounded border border-slate-800 bg-[#0b111d]/92 px-3 py-2 text-xs shadow-lg">
          <span className="font-medium text-slate-100">
            {geometry.electrodeCount}-Electrode Capacitive Slider
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="font-mono text-slate-300 tabular-nums">
            {geometry.sliderLengthMm.toFixed(0)} × {geometry.sliderWidthMm.toFixed(0)} mm
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className={finger.isTouching ? 'font-mono text-cyan-300' : 'font-mono text-amber-300'}>
            {finger.isTouching ? 'CONTACT' : `HOVER (${finger.heightMm.toFixed(1)} mm)`}
          </span>
        </div>

        <p className="max-w-md rounded border border-slate-800/80 bg-[#0b111d]/85 px-2.5 py-1 text-[11px] text-slate-300">
          Drag directly along the copper PCB track to slide the finger. Orbit/zoom outside the track.
          {showFieldLines && ' Field lines are conceptual illustrations, not an FEM solver.'}
        </p>
      </div>

      {/* Top-Right Compact View Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
        <button
          onClick={() => setTelemetryOpen(!telemetryOpen)}
          className="flex items-center gap-1.5 rounded border border-slate-800 bg-[#0b111d]/92 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200 transition-colors"
          title="Toggle live electrode readout drawer"
        >
          <Sliders className="h-3.5 w-3.5 text-cyan-400" />
          <span className="hidden sm:inline">{telemetryOpen ? 'Hide Readouts' : 'Show Readouts'}</span>
        </button>

        <button
          onClick={triggerCameraReset}
          className="flex items-center gap-1 rounded border border-slate-800 bg-[#0b111d]/92 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200 transition-colors"
          title="Reset camera view"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset View</span>
        </button>

        <button
          onClick={() => setIsFullscreen3D(!isFullscreen3D)}
          className="flex items-center gap-1 rounded border border-slate-800 bg-[#0b111d]/92 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200 transition-colors"
          title={isFullscreen3D ? 'Exit fullscreen 3D' : 'Fullscreen 3D view'}
        >
          {isFullscreen3D ? <Minimize2 className="h-3.5 w-3.5 text-cyan-400" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Right Live Telemetry Panel (Collapsible, keeps center 3D PCB unobstructed) */}
      {telemetryOpen && (
        <aside className="absolute top-16 right-4 z-10 max-h-[calc(100%-9.5rem)] w-[300px] max-w-[85vw] overflow-y-auto rounded-lg border border-slate-800 bg-[#0b111d]/94 p-3.5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Live Sensor Telemetry
            </h2>
            <span className="font-mono text-[11px] text-slate-400">
              {improvedEstimate.detected ? 'TOUCH ACTIVE' : 'NO TOUCH'}
            </span>
          </div>

          {/* Position Estimation Readouts */}
          <div className="mt-2.5 grid grid-cols-3 gap-2 border-b border-slate-800/80 pb-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Actual X</div>
              <div className="font-mono text-sm font-semibold text-emerald-300 tabular-nums">
                {finger.xMm.toFixed(1)} <span className="text-[10px] text-slate-400">mm</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Centroid</div>
              <div className="font-mono text-sm font-semibold text-cyan-300 tabular-nums">
                {improvedEstimate.positionMm !== null ? `${improvedEstimate.positionMm.toFixed(1)} ` : '— '}
                {improvedEstimate.positionMm !== null && <span className="text-[10px] text-slate-400">mm</span>}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Abs Error</div>
              <div className="font-mono text-sm font-semibold text-amber-300 tabular-nums">
                {improvedEstimate.errorMm !== null ? `${improvedEstimate.errorMm.toFixed(2)} ` : '— '}
                {improvedEstimate.errorMm !== null && <span className="text-[10px] text-slate-400">mm</span>}
              </div>
            </div>
          </div>

          {/* Double-finger warning when active */}
          {finger.secondFingerEnabled && (
            <div className="mt-2 rounded border border-amber-500/40 bg-amber-950/35 px-2.5 py-1.5 text-[11px] text-amber-200">
              2-Finger Limitation: 1D weighted centroid averages both fingers ({finger.xMm.toFixed(0)} &amp;{' '}
              {finger.secondFingerXMm.toFixed(0)} mm) into a single midpoint estimate.
            </div>
          )}

          {/* Individual Electrode Channel Bars */}
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400">
              <span>Channel</span>
              <span>ΔC / Total C</span>
            </div>
            {channels.map((ch) => {
              const isPeak = improvedEstimate.detected && ch.index === strongestChannelIndex;
              const pct = Math.min(100, Math.max(0, (ch.compensatedWeightPf / maxBarPf) * 100));
              return (
                <div key={ch.label} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span className={isPeak ? 'font-semibold text-cyan-300' : 'text-slate-300'}>
                      {ch.label} {isPeak ? '(PEAK)' : ''}
                    </span>
                    <span className="text-slate-300">
                      +{ch.calibratedDeltaPf.toFixed(2)} pF{' '}
                      <span className="text-slate-500">/ {ch.totalCapacitancePf.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-800">
                    <div
                      className={`h-full transition-[width] duration-75 ${
                        isPeak ? 'bg-cyan-400' : 'bg-orange-400/85'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Op-Amp AFE Readout Telemetry */}
          {peakCh && (
            <div className="mt-3 rounded border border-slate-800 bg-[#070b12]/90 p-2.5">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
                <span className="text-cyan-300">
                  Op-Amp U1 ({electronics.opAmpTopology === 'tia' ? 'TIA' : 'Integrator'})
                </span>
                <button
                  onClick={() => setActiveSection('circuit-diagram')}
                  className="text-slate-400 hover:text-cyan-300 underline decoration-slate-700"
                >
                  Schematic →
                </button>
              </div>

              <div className="mt-1.5 grid grid-cols-3 gap-1.5 font-mono tabular-nums">
                <div>
                  <div className="text-[9px] uppercase text-slate-500">I_in ({peakCh.label})</div>
                  <div className="text-xs font-semibold text-slate-200">
                    {peakCh.excitationCurrentUa.toFixed(1)} µA
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-slate-500">V_bias (+)</div>
                  <div className="text-xs font-semibold text-slate-200">
                    {peakCh.opAmpVirtualGndV.toFixed(2)} V
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-slate-500">U1 V_out</div>
                  <div
                    className={`text-xs font-semibold ${
                      peakCh.opAmpSaturated ? 'text-amber-300' : 'text-cyan-300'
                    }`}
                  >
                    {peakCh.opAmpOutV.toFixed(2)} V
                  </div>
                </div>
              </div>

              {/* Op-Amp Rail Output Bar with V_bias midpoint marker */}
              <div className="relative mt-2 h-2 w-full overflow-hidden rounded-sm bg-slate-800">
                <div
                  className={`h-full transition-[width] duration-75 ${
                    peakCh.opAmpSaturated ? 'bg-amber-400' : 'bg-cyan-400'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(0, (peakCh.opAmpOutV / electronics.vRef) * 100))}%`,
                  }}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-slate-200/80"
                  style={{ left: `${(peakCh.opAmpVirtualGndV / electronics.vRef) * 100}%` }}
                  title={`Virtual Ground V_bias = ${peakCh.opAmpVirtualGndV.toFixed(2)} V`}
                />
              </div>

              <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-slate-400 tabular-nums">
                <span>
                  ADC: {peakCh.adcCounts}/{adcMax}
                </span>
                <span>
                  {peakCh.opAmpSaturated
                    ? 'RAIL CLIP!'
                    : `Gain ${peakCh.opAmpGainVPerPf.toFixed(2)} V/pF`}
                </span>
              </div>
            </div>
          )}

          <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] text-slate-400">
            <span>Σw = {improvedEstimate.sumWeightsPf.toFixed(2)} pF</span>
            <span>Overlay: {geometry.overlayThicknessMm.toFixed(1)} mm</span>
          </div>
        </aside>
      )}

      {/* Collapsible Unified Bottom Control Dock */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center px-3">
        <button
          onClick={() => setDockExpanded(!dockExpanded)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-t-md border border-b-0 border-slate-800 bg-[#0b111d]/95 px-3 py-1 text-[11px] font-medium text-slate-300 hover:text-cyan-300"
        >
          {dockExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          <span>{dockExpanded ? 'Hide 3D Controls' : 'Show 3D Controls'}</span>
        </button>

        {dockExpanded && (
          <div className="pointer-events-auto w-full max-w-[960px] rounded-lg border border-slate-800 bg-[#0b111d]/95 p-3 shadow-2xl">
            {/* Dock Section Tabs + Quick Configuration */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDockTab('interaction')}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    dockTab === 'interaction'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Finger &amp; Touch Mode
                </button>
                <button
                  onClick={() => setDockTab('opamp')}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    dockTab === 'opamp'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Op-Amp Readout
                </button>
                <button
                  onClick={() => setDockTab('assembly')}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    dockTab === 'assembly'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Camera &amp; Exploded View
                </button>
                <button
                  onClick={() => setDockTab('geometry')}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    dockTab === 'geometry'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  PCB Stackup
                </button>
              </div>

              {/* 3 vs 6 Electrodes Switch */}
              <div className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 p-0.5">
                <button
                  onClick={() => setElectrodeCount(3)}
                  className={`rounded px-2.5 py-1 text-[11px] font-mono font-medium transition-colors ${
                    geometry.electrodeCount === 3
                      ? 'bg-orange-500/25 text-orange-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  3 Electrodes
                </button>
                <button
                  onClick={() => setElectrodeCount(6)}
                  className={`rounded px-2.5 py-1 text-[11px] font-mono font-medium transition-colors ${
                    geometry.electrodeCount === 6
                      ? 'bg-cyan-500/25 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  6 Electrodes
                </button>
              </div>
            </div>

            {/* Tab 1: Finger & Touch Mode */}
            {dockTab === 'interaction' && (
              <div className="mt-2.5 grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="md:col-span-7">
                  <div className="mb-1.5 text-[11px] font-medium text-slate-400">Touch Mode</div>
                  <div className="flex flex-wrap gap-1">
                    {TOUCH_MODES.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setTouchMode(m.id)}
                        className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                          touchMode === m.id
                            ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                            : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:col-span-5">
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Finger X</span>
                      <span className="tabular-nums">{finger.xMm.toFixed(1)} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={geometry.sliderLengthMm}
                      step={0.5}
                      value={finger.xMm}
                      onChange={(e) => {
                        setTouchMode('manual');
                        setFinger((p) => ({ ...p, xMm: Number(e.target.value) }));
                      }}
                      className="mt-1 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Finger Height</span>
                      <span className="tabular-nums">{finger.heightMm.toFixed(1)} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.2}
                      value={finger.heightMm}
                      onChange={(e) => {
                        const h = Number(e.target.value);
                        setTouchMode('manual');
                        setFinger((p) => ({ ...p, heightMm: h, isTouching: h <= 0.25 }));
                      }}
                      className="mt-1 w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Op-Amp Readout Stage Controls */}
            {dockTab === 'opamp' && (
              <div className="mt-2.5 space-y-2">
                <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-12">
                  <div className="md:col-span-4">
                    <div className="mb-1 text-[11px] font-medium text-slate-400">
                      Op-Amp U1 Topology
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setElectronics((el) => ({ ...el, opAmpTopology: 'tia' }))}
                        className={`flex-1 rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                          electronics.opAmpTopology === 'tia'
                            ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                            : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        TIA (Rf || Cf)
                      </button>
                      <button
                        onClick={() =>
                          setElectronics((el) => ({ ...el, opAmpTopology: 'charge_integrator' }))
                        }
                        className={`flex-1 rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                          electronics.opAmpTopology === 'charge_integrator'
                            ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                            : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        Charge Integrator
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:col-span-8">
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-300">
                        <span>Feedback Rf</span>
                        <span className="tabular-nums text-cyan-300">
                          {electronics.feedbackResistanceKOhm} kΩ
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={1000}
                        step={10}
                        value={electronics.feedbackResistanceKOhm}
                        onChange={(e) =>
                          setElectronics((el) => ({
                            ...el,
                            feedbackResistanceKOhm: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-300">
                        <span>Feedback Cf</span>
                        <span className="tabular-nums text-cyan-300">
                          {electronics.feedbackCapPf.toFixed(1)} pF
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1.0}
                        max={12.0}
                        step={0.1}
                        value={electronics.feedbackCapPf}
                        onChange={(e) =>
                          setElectronics((el) => ({
                            ...el,
                            feedbackCapPf: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-300">
                        <span>Drive V_exc</span>
                        <span className="tabular-nums text-cyan-300">
                          {electronics.excitationVoltageV.toFixed(1)} Vpp
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1.0}
                        max={5.0}
                        step={0.1}
                        value={electronics.excitationVoltageV}
                        onChange={(e) =>
                          setElectronics((el) => ({
                            ...el,
                            excitationVoltageV: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-300">
                        <span>Freq f_exc</span>
                        <span className="tabular-nums text-cyan-300">
                          {electronics.excitationFreqKHz} kHz
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={500}
                        step={10}
                        value={electronics.excitationFreqKHz}
                        onChange={(e) =>
                          setElectronics((el) => ({
                            ...el,
                            excitationFreqKHz: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>
                    Illustrative behavioral Op-Amp AFE model (U1 on rear PCB). Adjust Rf or Cf to observe gain and 3.3 V rail clipping.
                  </span>
                  <button
                    onClick={() => setActiveSection('circuit-diagram')}
                    className="font-mono text-cyan-300 hover:underline"
                  >
                    Open Full Circuit Diagram →
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Camera & Exploded View */}
            {dockTab === 'assembly' && (
              <div className="mt-2.5 grid grid-cols-1 items-center gap-3 md:grid-cols-12">
                <div className="md:col-span-5">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                    <Camera className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Camera &amp; Section View</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {CAMERA_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setCameraPreset(p.id)}
                        className={`rounded border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          cameraPreset === p.id
                            ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                            : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-4">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-orange-400" />
                      Exploded Assembly
                    </span>
                    <span className="tabular-nums">{Math.round(explodedFactor * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={explodedFactor}
                    onChange={(e) => setExplodedFactor(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </div>

                <div className="flex justify-end md:col-span-3">
                  <button
                    onClick={() => setShowFieldLines(!showFieldLines)}
                    className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                      showFieldLines
                        ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {showFieldLines ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    <span>Conceptual E-Field</span>
                  </button>
                </div>
              </div>
            )}

            {/* Tab 3: Illustrative PCB Stackup Dimensions */}
            {dockTab === 'geometry' && (
              <div className="mt-2.5 space-y-2">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Slider Length</span>
                      <span className="tabular-nums">{geometry.sliderLengthMm} mm</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={130}
                      step={5}
                      value={geometry.sliderLengthMm}
                      onChange={(e) => {
                        const len = Number(e.target.value);
                        setGeometry((g) => ({ ...g, sliderLengthMm: len }));
                        setFinger((f) => ({ ...f, xMm: Math.min(f.xMm, len) }));
                      }}
                      className="mt-1 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Overlay Thick.</span>
                      <span className="tabular-nums">{geometry.overlayThicknessMm.toFixed(1)} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0.3}
                      max={3.5}
                      step={0.1}
                      value={geometry.overlayThicknessMm}
                      onChange={(e) =>
                        setGeometry((g) => ({ ...g, overlayThicknessMm: Number(e.target.value) }))
                      }
                      className="mt-1 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Electrode Gap</span>
                      <span className="tabular-nums">{geometry.electrodeGapMm.toFixed(1)} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={3.0}
                      step={0.2}
                      value={geometry.electrodeGapMm}
                      onChange={(e) =>
                        setGeometry((g) => ({ ...g, electrodeGapMm: Number(e.target.value) }))
                      }
                      className="mt-1 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Dielectric εr</span>
                      <span className="tabular-nums">{geometry.overlayPermittivity.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={2.0}
                      max={7.0}
                      step={0.2}
                      value={geometry.overlayPermittivity}
                      onChange={(e) =>
                        setGeometry((g) => ({ ...g, overlayPermittivity: Number(e.target.value) }))
                      }
                      className="mt-1 w-full"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Note: Physical dimensions and permittivities are illustrative engineering defaults until calibrated against a fabricated PCB stackup.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
