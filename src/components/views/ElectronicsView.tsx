import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useSimulation } from '../../simulation/SimulationContext';

type StageId =
  | 'excitation'
  | 'electrode'
  | 'readout'
  | 'conditioning'
  | 'adc'
  | 'mcu'
  | 'centroid';

interface StageMeta {
  id: StageId;
  title: string;
  shortRole: string;
  modelingNote: string;
  purpose: string;
  circuitDetail: string;
  equation: string;
}

const STAGES: StageMeta[] = [
  {
    id: 'excitation',
    title: 'Excitation Source',
    shortRole: 'AC / Switched-Cap Drive',
    modelingNote: 'Lumped Frequency/Amplitude Abstraction',
    purpose:
      'Drives the capacitive sensor node with a controlled periodic waveform (square wave or sine wave) so charge flows proportionally to node capacitance.',
    circuitDetail:
      'In capacitive touch ICs (e.g. switched-capacitor charge transfer or mutual/self-capacitance bridges), an internal clock buffer switches between 0 V and V_exc at 50–500 kHz.',
    equation: 'V_exc(t) = (V_pp / 2) · sin(2π · f_exc · t)',
  },
  {
    id: 'electrode',
    title: 'Sensor Electrode',
    shortRole: 'C_0 + ΔC(x)',
    modelingNote: 'Analytical Spatial Overlap + Noise/Coupling',
    purpose:
      'Converts physical finger proximity along the track into a small fractional capacitance increase (+0.2 to +2.5 pF) atop a ~12 pF parasitic baseline.',
    circuitDetail:
      'Modeled as a shunt capacitor to ground C_total,i = C_0,i + ΔC_finger,i(x) + C_crosstalk,i. Adjacent trace coupling and parasitic mismatch distort the raw node impedance.',
    equation: 'I_sense = 2π · f_exc · V_exc/2 · C_total',
  },
  {
    id: 'readout',
    title: 'Readout Circuit',
    shortRole: 'Charge Transfer / TIA',
    modelingNote: 'Conceptual Gain & Current-to-Voltage Stage',
    purpose:
      'Converts picofarad-scale reactive current or charge packets into a measurable analog voltage swing without loading the high-impedance sensor pad.',
    circuitDetail:
      'Typically implemented as a Charge-Transfer Integrator or Transimpedance Amplifier (TIA) with feedback capacitor C_f / resistor R_f. Here we model effective stage gain rather than a SPICE op-amp.',
    equation: 'V_tia ∝ G_stage · (C_total - C_offset)',
  },
  {
    id: 'conditioning',
    title: 'Signal Conditioning',
    shortRole: 'Demod + LPF',
    modelingNote: 'Mathematical Envelope & Anti-Aliasing Abstraction',
    purpose:
      'Synchronous demodulation and low-pass filtering reject out-of-band 50/60 Hz mains hum and high-frequency EMI while isolating the slow finger-motion envelope.',
    circuitDetail:
      'Extracts the DC envelope proportional to ΔC and scales it within the ADC input span [0, V_ref]. Real hardware uses a mixer/switch synchronously clocked with f_exc plus an RC/active filter.',
    equation: 'V_cond = clamp(V_bias + G · ΔC, 0, V_ref)',
  },
  {
    id: 'adc',
    title: 'ADC Quantization',
    shortRole: '10–14 Bit SAR/ΣΔ',
    modelingNote: 'Exact Bit-Depth Quantization Model',
    purpose:
      'Samples and digitizes each conditioned channel voltage into discrete integer counts for microcontroller processing.',
    circuitDetail:
      'An N-bit ADC maps [0, V_ref] to [0, 2^N - 1]. Insufficient bit depth introduces quantization steps; higher resolution improves fine boundary interpolation.',
    equation: 'Counts = round((V_cond / V_ref) · (2^N - 1))',
  },
  {
    id: 'mcu',
    title: 'MCU Processing',
    shortRole: 'Baseline + Filter',
    modelingNote: 'Real-Time Digital Firmware Pipeline',
    purpose:
      'Subtracts per-channel calibrated baseline C_cal,i, optionally deconvolves adjacent coupling, applies deadband thresholding, and smooths temporal noise.',
    circuitDetail:
      'Runs deterministic fixed-point or floating-point DSP in firmware: baseline tracking, IIR/EMA low-pass or moving average, and touch state machine hysteresis.',
    equation: 'w_i = max(0, Filter(ΔC_cal,i) - T_floor)',
  },
  {
    id: 'centroid',
    title: 'Position Estimator',
    shortRole: 'Weighted Centroid',
    modelingNote: 'Exact Algebraic Centroid Estimator',
    purpose:
      'Combines all non-negative channel weights w_i with known physical electrode centers x_i to resolve sub-millimeter finger position.',
    circuitDetail:
      'Reports touch active when Σw_i ≥ T_touch, and outputs x_est = Σ(x_i · w_i) / Σw_i. Requires at least two overlapping channels at boundaries for smooth interpolation.',
    equation: 'x_est = Σ(x_i · w_i) / Σ(w_i)',
  },
];

/**
 * Generates an SVG polyline path representing a live stage waveform.
 */
function buildWaveformPath(
  stage: StageId,
  freqKHz: number,
  ampV: number,
  normSignal: number,
  adcBits: number
): string {
  const pts: string[] = [];
  const samples = 64;
  const w = 136;
  const h = 44;
  const midY = h * 0.5;
  const cycles = 1.5 + (freqKHz / 500) * 4.5;

  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const x = u * w;
    let y = midY;

    if (stage === 'excitation') {
      const s = Math.sin(u * Math.PI * 2 * cycles);
      y = midY - s * (ampV / 5) * 16;
    } else if (stage === 'electrode') {
      const mod = 0.35 + 0.65 * normSignal;
      const s = Math.sin(u * Math.PI * 2 * cycles + 0.4);
      y = midY - s * mod * 17;
    } else if (stage === 'readout') {
      const mod = 0.25 + 0.75 * normSignal;
      const s = Math.abs(Math.sin(u * Math.PI * cycles));
      y = h - 6 - s * mod * 30;
    } else if (stage === 'conditioning') {
      const level = 6 + normSignal * 30;
      y = h - 4 - level + Math.sin(u * Math.PI * 2) * 1.2;
    } else if (stage === 'adc') {
      const levels = adcBits === 10 ? 6 : adcBits === 12 ? 12 : 20;
      const raw = normSignal * 0.85 + 0.1 * Math.sin(u * Math.PI);
      const q = Math.round(raw * levels) / levels;
      y = h - 5 - q * 32;
    } else if (stage === 'mcu') {
      const clean = normSignal * 0.88;
      y = h - 6 - clean * 30;
    } else if (stage === 'centroid') {
      const bar = Math.min(1, Math.max(0.05, normSignal));
      y = h - 6 - bar * 32 * (0.85 + 0.15 * u);
    }
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

export const ElectronicsView: React.FC = () => {
  const { electronics, setElectronics, tickOutput, finger, setFinger, geometry, setTouchMode, setActiveSection } =
    useSimulation();
  const [selectedStage, setSelectedStage] = useState<StageId>('readout');

  const peakCh = tickOutput.channels[tickOutput.strongestChannelIndex] ?? tickOutput.channels[0];
  const normSig = Math.min(1, Math.max(0, (peakCh?.compensatedWeightPf ?? 0) / 2.2));

  const activeStageMeta = useMemo(
    () => STAGES.find((s) => s.id === selectedStage) ?? STAGES[0],
    [selectedStage]
  );

  const stageLiveValue = (id: StageId): string => {
    switch (id) {
      case 'excitation':
        return `${electronics.excitationFreqKHz} kHz · ${electronics.excitationVoltageV.toFixed(1)} Vpp`;
      case 'electrode':
        return `${peakCh?.label}: ${peakCh?.totalCapacitancePf.toFixed(2)} pF`;
      case 'readout':
        return `U1 V_out: ${peakCh?.opAmpOutV.toFixed(2)} V`;
      case 'conditioning':
        return `V_cond: ${peakCh?.conditionedVoltageV.toFixed(2)} V`;
      case 'adc':
        return `${peakCh?.adcCounts} / ${Math.pow(2, electronics.adcBits) - 1}`;
      case 'mcu':
        return `w_peak: ${peakCh?.compensatedWeightPf.toFixed(2)} pF`;
      case 'centroid':
        return tickOutput.improvedEstimate.positionMm !== null
          ? `x_est: ${tickOutput.improvedEstimate.positionMm.toFixed(1)} mm`
          : 'No Touch';
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Readout Electronics &amp; Signal Chain
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Interactive end-to-end signal path from excitation through analog conditioning, ADC quantization, and centroid estimation. Click any block to inspect its engineering role and modeling assumptions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-mono text-amber-300">
            Conceptual Readout Model · Illustrative Op-Amp Parameters (Not SPICE-Validated)
          </div>
          <button
            onClick={() => setActiveSection('circuit-diagram')}
            className="rounded border border-cyan-500/50 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25"
          >
            View Schematic Diagram →
          </button>
        </div>
      </div>

      {/* Interactive 7-Block Signal Chain */}
      <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
        <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
          {STAGES.map((stage, idx) => {
            const selected = selectedStage === stage.id;
            const path = buildWaveformPath(
              stage.id,
              electronics.excitationFreqKHz,
              electronics.excitationVoltageV,
              normSig,
              electronics.adcBits
            );
            return (
              <React.Fragment key={stage.id}>
                <button
                  onClick={() => setSelectedStage(stage.id)}
                  className={`flex min-w-[162px] flex-1 flex-col justify-between rounded-md border p-3 text-left transition-colors ${
                    selected
                      ? 'border-cyan-400 bg-cyan-950/30'
                      : 'border-slate-800 bg-[#070b12] hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                      <span>0{idx + 1}</span>
                      <span>{stage.shortRole}</span>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-100">{stage.title}</div>
                  </div>

                  {/* Live Stage Waveform */}
                  <svg viewBox="0 0 136 44" className="my-2.5 h-11 w-full rounded bg-slate-950/90">
                    <line x1="0" y1="22" x2="136" y2="22" stroke="#1e293b" strokeWidth="1" />
                    <polyline
                      fill="none"
                      stroke={selected ? '#22d3ee' : '#38bdf8'}
                      strokeWidth="1.8"
                      points={path}
                    />
                  </svg>

                  <div className="font-mono text-[11px] font-medium text-cyan-300 tabular-nums">
                    {stageLiveValue(stage.id)}
                  </div>
                </button>

                {idx < STAGES.length - 1 && (
                  <div className="flex shrink-0 items-center text-slate-600">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Stage Inspector + Editable Circuit Parameters */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-100">
                {activeStageMeta.title}
              </h2>
              <p className="text-xs text-cyan-300 font-mono">{activeStageMeta.modelingNote}</p>
            </div>
            <div className="font-mono text-sm font-semibold text-slate-100 tabular-nums">
              {stageLiveValue(activeStageMeta.id)}
            </div>
          </div>

          <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-300">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Purpose
              </h3>
              <p className="mt-1">{activeStageMeta.purpose}</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Operation &amp; Modeling Boundary
              </h3>
              <p className="mt-1">{activeStageMeta.circuitDetail}</p>
            </div>

            <div className="rounded border border-slate-800 bg-[#070b12] p-3 font-mono text-xs text-cyan-200">
              {activeStageMeta.equation}
            </div>
          </div>
        </div>

        {/* Editable Excitation / Analog / ADC Controls */}
        <div className="space-y-4 rounded-lg border border-slate-800 bg-[#0b111d] p-5 lg:col-span-5">
          <h2 className="text-sm font-semibold text-slate-200">
            Editable Readout &amp; Excitation Parameters
          </h2>

          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Excitation Frequency f_exc</span>
                <span className="tabular-nums text-cyan-300">{electronics.excitationFreqKHz} kHz</span>
              </div>
              <input
                type="range"
                min={50}
                max={500}
                step={10}
                value={electronics.excitationFreqKHz}
                onChange={(e) =>
                  setElectronics((el) => ({ ...el, excitationFreqKHz: Number(e.target.value) }))
                }
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Excitation Amplitude V_exc</span>
                <span className="tabular-nums text-cyan-300">{electronics.excitationVoltageV.toFixed(1)} Vpp</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={5.0}
                step={0.1}
                value={electronics.excitationVoltageV}
                onChange={(e) =>
                  setElectronics((el) => ({ ...el, excitationVoltageV: Number(e.target.value) }))
                }
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Post-Stage PGA Multiplier</span>
                <span className="tabular-nums text-cyan-300">{electronics.readoutGain.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={3.0}
                step={0.05}
                value={electronics.readoutGain}
                onChange={(e) =>
                  setElectronics((el) => ({ ...el, readoutGain: Number(e.target.value) }))
                }
                className="mt-1 w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex justify-between text-xs font-mono text-slate-300">
                  <span>Op-Amp Rf</span>
                  <span className="tabular-nums text-cyan-300">{electronics.feedbackResistanceKOhm} kΩ</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={1000}
                  step={10}
                  value={electronics.feedbackResistanceKOhm}
                  onChange={(e) =>
                    setElectronics((el) => ({ ...el, feedbackResistanceKOhm: Number(e.target.value) }))
                  }
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs font-mono text-slate-300">
                  <span>Op-Amp Cf</span>
                  <span className="tabular-nums text-cyan-300">{electronics.feedbackCapPf.toFixed(1)} pF</span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={12.0}
                  step={0.1}
                  value={electronics.feedbackCapPf}
                  onChange={(e) =>
                    setElectronics((el) => ({ ...el, feedbackCapPf: Number(e.target.value) }))
                  }
                  className="mt-1 w-full"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-mono text-slate-300">ADC Resolution</span>
              <div className="flex gap-1">
                {([10, 12, 14] as const).map((bits) => (
                  <button
                    key={bits}
                    onClick={() => setElectronics((el) => ({ ...el, adcBits: bits }))}
                    className={`rounded border px-2.5 py-1 text-xs font-mono ${
                      electronics.adcBits === bits
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {bits}-bit
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Test Finger Position X</span>
                <span className="tabular-nums text-emerald-300">{finger.xMm.toFixed(1)} mm</span>
              </div>
              <input
                type="range"
                min={0}
                max={geometry.sliderLengthMm}
                step={0.5}
                value={finger.xMm}
                onChange={(e) => {
                  setTouchMode('manual');
                  setFinger((f) => ({ ...f, xMm: Number(e.target.value), isTouching: true, heightMm: 0 }));
                }}
                className="mt-1 w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Per-Channel Electrical Readout Table */}
      <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">
          Per-Channel Readout Telemetry ({geometry.electrodeCount} Channels)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-4">Channel</th>
                <th className="py-2 pr-4">Total C (pF)</th>
                <th className="py-2 pr-4">I_sense (µA pk)</th>
                <th className="py-2 pr-4">Op-Amp V_out (V)</th>
                <th className="py-2 pr-4">ADC ({electronics.adcBits}-bit)</th>
                <th className="py-2">Weight w_i (pF)</th>
              </tr>
            </thead>
            <tbody>
              {tickOutput.channels.map((ch) => {
                const isPeak =
                  tickOutput.improvedEstimate.detected &&
                  ch.index === tickOutput.strongestChannelIndex;
                return (
                  <tr
                    key={ch.label}
                    className={`border-b border-slate-800/60 ${
                      isPeak ? 'bg-cyan-950/20 text-cyan-200' : 'text-slate-300'
                    }`}
                  >
                    <td className="py-2 pr-4 font-semibold">
                      {ch.label} {isPeak ? '(PEAK)' : ''}
                    </td>
                    <td className="py-2 pr-4">{ch.totalCapacitancePf.toFixed(3)}</td>
                    <td className="py-2 pr-4">{ch.excitationCurrentUa.toFixed(2)}</td>
                    <td className={`py-2 pr-4 ${ch.opAmpSaturated ? 'text-amber-300 font-semibold' : ''}`}>
                      {ch.opAmpOutV.toFixed(3)} {ch.opAmpSaturated ? '(CLIP)' : ''}
                    </td>
                    <td className="py-2 pr-4">{ch.adcCounts}</td>
                    <td className="py-2">{ch.compensatedWeightPf.toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
