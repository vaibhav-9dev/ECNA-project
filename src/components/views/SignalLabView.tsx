import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSimulation } from '../../simulation/SimulationContext';

const CHANNEL_COLORS = ['#22d3ee', '#f59e0b', '#34d399', '#a78bfa', '#fb7185', '#38bdf8'];

export const SignalLabView: React.FC = () => {
  const {
    geometry,
    setGeometry,
    finger,
    setFinger,
    setTouchMode,
    nonIdealities,
    setNonIdealities,
    enableAllNonIdealities,
    electronics,
    setElectronics,
    algorithm,
    setAlgorithm,
    calibrateBaseline,
    lastCalibratedAtSec,
    tickOutput,
    history,
  } = useSimulation();

  const barData = useMemo(
    () =>
      tickOutput.channels.map((ch) => ({
        channel: ch.label,
        cleanDelta: Number(ch.cleanDeltaPf.toFixed(3)),
        distortedDelta: Number(ch.distortedDeltaPf.toFixed(3)),
        calibratedWeight: Number(ch.compensatedWeightPf.toFixed(3)),
      })),
    [tickOutput.channels]
  );

  const timeSeriesData = useMemo(() => {
    return history.slice(-60).map((s) => {
      const row: Record<string, number> = { t: s.t };
      s.distortedSignalsPf.forEach((v, idx) => {
        row[`E${idx + 1}`] = v;
      });
      return row;
    });
  }, [history]);

  const { rawEstimate, improvedEstimate } = tickOutput;
  const anyNonIdeality =
    nonIdealities.noiseEnabled ||
    nonIdealities.couplingEnabled ||
    nonIdealities.parasiticsEnabled ||
    nonIdealities.driftEnabled;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 lg:p-6">
      {/* Header & Global Mode Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Signal Laboratory &amp; Non-Idealities
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Inject realistic sensor non-idealities individually or simultaneously to observe false touches, missed touches, and boundary position distortion against the clean ideal response.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => enableAllNonIdealities(false)}
            className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
              !anyNonIdeality
                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
            }`}
          >
            Clean Reference
          </button>
          <button
            onClick={() => enableAllNonIdealities(true)}
            className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
              nonIdealities.noiseEnabled &&
              nonIdealities.couplingEnabled &&
              nonIdealities.parasiticsEnabled &&
              nonIdealities.driftEnabled
                ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
            }`}
          >
            Enable All Effects
          </button>
          <button
            onClick={calibrateBaseline}
            className="rounded border border-cyan-500/60 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 transition-colors"
          >
            Capture Baseline Calibration
          </button>
        </div>
      </div>

      {/* Detection Diagnostics (Before Raw vs After Improved) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Raw Uncalibrated Signal
            </span>
            {rawEstimate.falseTouch ? (
              <span className="flex items-center gap-1 font-mono text-xs text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" /> FALSE TOUCH
              </span>
            ) : rawEstimate.missedTouch ? (
              <span className="flex items-center gap-1 font-mono text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> MISSED TOUCH
              </span>
            ) : (
              <span className="flex items-center gap-1 font-mono text-xs text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />{' '}
                {rawEstimate.detected ? 'DETECTED' : 'IDLE'}
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
            <div>
              <span className="text-slate-500">Est X:</span>{' '}
              <span className="text-slate-100">
                {rawEstimate.positionMm !== null ? `${rawEstimate.positionMm.toFixed(1)} mm` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Error:</span>{' '}
              <span className="text-amber-300">
                {rawEstimate.errorMm !== null ? `${rawEstimate.errorMm.toFixed(2)} mm` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Σw:</span>{' '}
              <span className="text-slate-200">{rawEstimate.sumWeightsPf.toFixed(2)} pF</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Calibrated &amp; Compensated Signal
            </span>
            {improvedEstimate.falseTouch ? (
              <span className="flex items-center gap-1 font-mono text-xs text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" /> FALSE TOUCH
              </span>
            ) : improvedEstimate.missedTouch ? (
              <span className="flex items-center gap-1 font-mono text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> MISSED TOUCH
              </span>
            ) : (
              <span className="flex items-center gap-1 font-mono text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />{' '}
                {improvedEstimate.detected ? 'DETECTED' : 'IDLE'}
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
            <div>
              <span className="text-slate-500">Est X:</span>{' '}
              <span className="text-cyan-300">
                {improvedEstimate.positionMm !== null
                  ? `${improvedEstimate.positionMm.toFixed(1)} mm`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Error:</span>{' '}
              <span className="text-emerald-300">
                {improvedEstimate.errorMm !== null
                  ? `${improvedEstimate.errorMm.toFixed(2)} mm`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Calibrated:</span>{' '}
              <span className="text-slate-200">
                {lastCalibratedAtSec !== null ? `t=${lastCalibratedAtSec.toFixed(1)}s` : 'Default'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split: Parameter Workbench + Side-by-Side Plots */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Independent Non-Ideality & Physical Controls */}
        <div className="space-y-4 rounded-lg border border-slate-800 bg-[#0b111d] p-4 lg:col-span-5">
          <h2 className="text-sm font-semibold text-slate-200">
            Independent Non-Ideality &amp; Physical Controls
          </h2>

          {/* 1. Noise */}
          <div className="rounded border border-slate-800/80 bg-[#070b12] p-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={nonIdealities.noiseEnabled}
                  onChange={(e) =>
                    setNonIdealities((n) => ({ ...n, noiseEnabled: e.target.checked }))
                  }
                  className="accent-cyan-400"
                />
                Channel Noise (Gaussian RMS)
              </label>
              <span className="font-mono text-xs text-cyan-300 tabular-nums">
                {nonIdealities.noiseAmplitudePf.toFixed(2)} pF
              </span>
            </div>
            <input
              type="range"
              min={0.01}
              max={0.35}
              step={0.01}
              value={nonIdealities.noiseAmplitudePf}
              onChange={(e) =>
                setNonIdealities((n) => ({
                  ...n,
                  noiseEnabled: true,
                  noiseAmplitudePf: Number(e.target.value),
                }))
              }
              className="mt-2 w-full"
            />
          </div>

          {/* 2. Adjacent Electrode Coupling */}
          <div className="rounded border border-slate-800/80 bg-[#070b12] p-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={nonIdealities.couplingEnabled}
                  onChange={(e) =>
                    setNonIdealities((n) => ({ ...n, couplingEnabled: e.target.checked }))
                  }
                  className="accent-cyan-400"
                />
                Adjacent Electrode Coupling
              </label>
              <span className="font-mono text-xs text-cyan-300 tabular-nums">
                {Math.round(nonIdealities.couplingCoeff * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.02}
              max={0.45}
              step={0.01}
              value={nonIdealities.couplingCoeff}
              onChange={(e) =>
                setNonIdealities((n) => ({
                  ...n,
                  couplingEnabled: true,
                  couplingCoeff: Number(e.target.value),
                }))
              }
              className="mt-2 w-full"
            />
          </div>

          {/* 3. Unequal Parasitics */}
          <div className="rounded border border-slate-800/80 bg-[#070b12] p-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={nonIdealities.parasiticsEnabled}
                  onChange={(e) =>
                    setNonIdealities((n) => ({ ...n, parasiticsEnabled: e.target.checked }))
                  }
                  className="accent-cyan-400"
                />
                Unequal Parasitic Capacitances
              </label>
              <span className="font-mono text-xs text-cyan-300 tabular-nums">
                ±{nonIdealities.parasiticSpreadPf.toFixed(1)} pF
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={3.0}
              step={0.1}
              value={nonIdealities.parasiticSpreadPf}
              onChange={(e) =>
                setNonIdealities((n) => ({
                  ...n,
                  parasiticsEnabled: true,
                  parasiticSpreadPf: Number(e.target.value),
                }))
              }
              className="mt-2 w-full"
            />
          </div>

          {/* 4. Signal Drift */}
          <div className="rounded border border-slate-800/80 bg-[#070b12] p-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={nonIdealities.driftEnabled}
                  onChange={(e) =>
                    setNonIdealities((n) => ({ ...n, driftEnabled: e.target.checked }))
                  }
                  className="accent-cyan-400"
                />
                Thermal / Humidity Baseline Drift
              </label>
              <span className="font-mono text-xs text-cyan-300 tabular-nums">
                ±{nonIdealities.driftAmplitudePf.toFixed(2)} pF
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.6}
              step={0.05}
              value={nonIdealities.driftAmplitudePf}
              onChange={(e) =>
                setNonIdealities((n) => ({
                  ...n,
                  driftEnabled: true,
                  driftAmplitudePf: Number(e.target.value),
                }))
              }
              className="mt-2 w-full"
            />
          </div>

          {/* Physical & Threshold Controls */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span>Touch Threshold</span>
                <span>{algorithm.touchThresholdPf.toFixed(2)} pF</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1.5}
                step={0.05}
                value={algorithm.touchThresholdPf}
                onChange={(e) =>
                  setAlgorithm((a) => ({ ...a, touchThresholdPf: Number(e.target.value) }))
                }
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span>Overlay Thick.</span>
                <span>{geometry.overlayThicknessMm.toFixed(1)} mm</span>
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
                <span>Finger Height</span>
                <span>{finger.heightMm.toFixed(1)} mm</span>
              </div>
              <input
                type="range"
                min={0}
                max={8}
                step={0.2}
                value={finger.heightMm}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setTouchMode('manual');
                  setFinger((f) => ({ ...f, heightMm: h, isTouching: h <= 0.25 }));
                }}
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span>Finger X</span>
                <span>{finger.xMm.toFixed(1)} mm</span>
              </div>
              <input
                type="range"
                min={0}
                max={geometry.sliderLengthMm}
                step={0.5}
                value={finger.xMm}
                onChange={(e) => {
                  setTouchMode('manual');
                  setFinger((f) => ({ ...f, xMm: Number(e.target.value) }));
                }}
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span>f_exc</span>
                <span>{electronics.excitationFreqKHz} kHz</span>
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
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span>V_exc</span>
                <span>{electronics.excitationVoltageV.toFixed(1)} V</span>
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
          </div>
        </div>

        {/* Right Side: Clean vs Distorted Side-by-Side Comparison & Real-Time Oscilloscope */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-200">
              Clean Ideal vs. Distorted vs. Calibrated Channel ΔC (pF)
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              Side-by-side instantaneous electrode response comparing ideal physics against uncalibrated distorted readings and compensated weights.
            </p>
            <div className="h-[235px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 12, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="channel"
                    stroke="#64748b"
                    tick={{ fill: '#cbd5e1', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                    unit=" pF"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b111d',
                      borderColor: '#334155',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'IBM Plex Mono' }} />
                  <Bar dataKey="cleanDelta" name="Clean Ideal ΔC" fill="#10b981" isAnimationActive={false} />
                  <Bar dataKey="distortedDelta" name="Distorted Raw ΔC" fill="#f59e0b" isAnimationActive={false} />
                  <Bar dataKey="calibratedWeight" name="Compensated w_i" fill="#22d3ee" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-200">
              Live Distorted Channel Signals Over Time (pF)
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              Real-time multi-channel trace showing baseline offsets, noise jitter, and drift.
            </p>
            <div className="h-[225px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData} margin={{ top: 10, right: 12, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="t"
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                    unit="s"
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                    unit=" pF"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b111d',
                      borderColor: '#334155',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '12px',
                    }}
                  />
                  {tickOutput.channels.map((ch, idx) => (
                    <Line
                      key={ch.label}
                      type="monotone"
                      dataKey={ch.label}
                      stroke={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
                      strokeWidth={1.7}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
