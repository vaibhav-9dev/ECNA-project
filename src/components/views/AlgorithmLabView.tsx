import React, { useMemo } from 'react';
import {
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
import {
  applyAdjacentCoupling,
  compensateCoupling,
  computeCleanDeltas,
  computeElectrodeLayout,
} from '../../simulation/sensorEngine';
import { FilterType } from '../../simulation/types';

export const AlgorithmLabView: React.FC = () => {
  const {
    geometry,
    setElectrodeCount,
    finger,
    setFinger,
    setTouchMode,
    nonIdealities,
    algorithm,
    setAlgorithm,
    calibrateBaseline,
    calibratedBaselinePf,
    tickOutput,
  } = useSimulation();

  const { improvedEstimate, twin3Electrode, twin6Electrode, channels } = tickOutput;

  // Sweep full slider track [0 .. sliderLengthMm] to plot 3-electrode vs 6-electrode linearity & error
  const linearityCurve = useMemo(() => {
    const pts = [];
    const alpha = nonIdealities.couplingEnabled ? nonIdealities.couplingCoeff : 0;
    const steps = 60;
    const layout3 = computeElectrodeLayout(3, geometry.sliderLengthMm, geometry.electrodeGapMm);
    const layout6 = computeElectrodeLayout(6, geometry.sliderLengthMm, geometry.electrodeGapMm);

    const evalCount = (cnt: 3 | 6, x: number, layout: typeof layout3) => {
      const f = { ...finger, xMm: x, isTouching: true, heightMm: 0, secondFingerEnabled: false };
      const { cleanDeltas } = computeCleanDeltas(cnt, geometry, f);
      const coupled = applyAdjacentCoupling(cleanDeltas, alpha);
      const deCoupled = algorithm.couplingCompensation
        ? compensateCoupling(coupled, alpha, algorithm.compensationStrength)
        : coupled;
      const weights = deCoupled.map((w) => Math.max(0, w - algorithm.channelNoiseFloorPf));
      const sumW = weights.reduce((a, b) => a + b, 0);
      if (sumW < algorithm.touchThresholdPf) return null;
      const sumXW = weights.reduce((acc, w, i) => acc + layout[i].centerMm * w, 0);
      return Number(Math.abs(sumXW / sumW - x).toFixed(2));
    };

    for (let s = 0; s <= steps; s++) {
      const x = (s / steps) * geometry.sliderLengthMm;
      pts.push({
        xMm: Number(x.toFixed(1)),
        err3: evalCount(3, x, layout3),
        err6: evalCount(6, x, layout6),
      });
    }
    return pts;
  }, [geometry, finger, nonIdealities, algorithm]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Weighted-Centroid Algorithm Laboratory
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Inspect every step of position estimation: baseline calibration, coupling deconvolution, non-negative thresholding, temporal filtering, and 3-vs-6 electrode boundary accuracy.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={calibrateBaseline}
            className="rounded border border-cyan-500/60 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25"
          >
            Calibrate Baseline
          </button>
          <div className="flex rounded border border-slate-800 bg-slate-900 p-0.5 font-mono text-xs">
            <button
              onClick={() => setElectrodeCount(3)}
              className={`rounded px-2.5 py-1 ${
                geometry.electrodeCount === 3 ? 'bg-orange-500/25 text-orange-300' : 'text-slate-400'
              }`}
            >
              3 Electrodes
            </button>
            <button
              onClick={() => setElectrodeCount(6)}
              className={`rounded px-2.5 py-1 ${
                geometry.electrodeCount === 6 ? 'bg-cyan-500/25 text-cyan-300' : 'text-slate-400'
              }`}
            >
              6 Electrodes
            </button>
          </div>
        </div>
      </div>

      {/* Step-by-Step Pipeline & Live Formula */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Controls Column */}
        <div className="space-y-4 rounded-lg border border-slate-800 bg-[#0b111d] p-4 lg:col-span-4">
          <h2 className="text-sm font-semibold text-slate-200">DSP &amp; Filtering Stages</h2>

          <div>
            <div className="flex justify-between text-xs font-mono text-slate-300">
              <span>Finger Position X</span>
              <span className="text-emerald-300 tabular-nums">{finger.xMm.toFixed(1)} mm</span>
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

          <div className="border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={algorithm.couplingCompensation}
                  onChange={(e) =>
                    setAlgorithm((a) => ({ ...a, couplingCompensation: e.target.checked }))
                  }
                  className="accent-cyan-400"
                />
                Coupling Deconvolution
              </label>
              <span className="font-mono text-xs text-cyan-300 tabular-nums">
                {Math.round(algorithm.compensationStrength * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={algorithm.compensationStrength}
              onChange={(e) =>
                setAlgorithm((a) => ({ ...a, compensationStrength: Number(e.target.value) }))
              }
              className="mt-1.5 w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span>Noise Floor</span>
                <span>{algorithm.channelNoiseFloorPf.toFixed(2)} pF</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.25}
                step={0.01}
                value={algorithm.channelNoiseFloorPf}
                onChange={(e) =>
                  setAlgorithm((a) => ({ ...a, channelNoiseFloorPf: Number(e.target.value) }))
                }
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span>Touch Thresh.</span>
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
          </div>

          <div className="border-t border-slate-800 pt-3">
            <div className="mb-1.5 text-xs font-medium text-slate-300">Temporal Smoothing Filter</div>
            <div className="grid grid-cols-3 gap-1">
              {(['none', 'ema', 'moving_avg'] as FilterType[]).map((ft) => (
                <button
                  key={ft}
                  onClick={() => setAlgorithm((a) => ({ ...a, filterType: ft }))}
                  className={`rounded border py-1.5 text-[11px] font-mono ${
                    algorithm.filterType === ft
                      ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-800 bg-slate-900 text-slate-400'
                  }`}
                >
                  {ft === 'none' ? 'None' : ft === 'ema' ? 'EMA LPF' : 'Moving Avg'}
                </button>
              ))}
            </div>

            {algorithm.filterType === 'ema' && (
              <div className="mt-2.5">
                <div className="flex justify-between text-[11px] font-mono text-slate-300">
                  <span>EMA α (responsiveness)</span>
                  <span>{algorithm.emaAlpha.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.95}
                  step={0.05}
                  value={algorithm.emaAlpha}
                  onChange={(e) =>
                    setAlgorithm((a) => ({ ...a, emaAlpha: Number(e.target.value) }))
                  }
                  className="mt-1 w-full"
                />
              </div>
            )}

            {algorithm.filterType === 'moving_avg' && (
              <div className="mt-2.5">
                <div className="flex justify-between text-[11px] font-mono text-slate-300">
                  <span>Window Length N</span>
                  <span>{algorithm.movingAvgWindow} samples</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={12}
                  step={1}
                  value={algorithm.movingAvgWindow}
                  onChange={(e) =>
                    setAlgorithm((a) => ({ ...a, movingAvgWindow: Number(e.target.value) }))
                  }
                  className="mt-1 w-full"
                />
              </div>
            )}
          </div>
        </div>

        {/* Live Algebraic Breakdown Table */}
        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                Live Weighted-Centroid Step-by-Step Calculation
              </h2>
              <p className="font-mono text-xs text-cyan-300">
                x_est = Σ(x_i · w_i) / Σ(w_i) ={' '}
                {improvedEstimate.sumWeightedPositionsMmPf.toFixed(2)} /{' '}
                {improvedEstimate.sumWeightsPf.toFixed(3)} ={' '}
                {improvedEstimate.positionMm !== null
                  ? `${improvedEstimate.positionMm.toFixed(2)} mm`
                  : 'Below Touch Threshold'}
              </p>
            </div>
            <div className="font-mono text-xs text-slate-300 tabular-nums">
              Actual: <span className="text-emerald-300">{finger.xMm.toFixed(2)} mm</span> · Error:{' '}
              <span className="text-amber-300">
                {improvedEstimate.errorMm !== null ? `${improvedEstimate.errorMm.toFixed(2)} mm` : '—'}
              </span>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left font-mono text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3">Pad</th>
                  <th className="py-2 pr-3">Center x_i</th>
                  <th className="py-2 pr-3">Total C_i</th>
                  <th className="py-2 pr-3">Cal C_0,i</th>
                  <th className="py-2 pr-3">Cal ΔC_i</th>
                  <th className="py-2 pr-3">Weight w_i</th>
                  <th className="py-2">x_i · w_i</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch, idx) => (
                  <tr key={ch.label} className="border-b border-slate-800/60 text-slate-300">
                    <td className="py-2 pr-3 font-semibold text-slate-100">{ch.label}</td>
                    <td className="py-2 pr-3">{ch.centerMm.toFixed(1)} mm</td>
                    <td className="py-2 pr-3">{ch.totalCapacitancePf.toFixed(3)} pF</td>
                    <td className="py-2 pr-3">{(calibratedBaselinePf[idx] ?? 12).toFixed(3)} pF</td>
                    <td className="py-2 pr-3">{ch.calibratedDeltaPf.toFixed(3)} pF</td>
                    <td className="py-2 pr-3 text-cyan-300">{ch.compensatedWeightPf.toFixed(3)} pF</td>
                    <td className="py-2 text-slate-200">{ch.weightedTermMmPf.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-900/70 font-semibold text-slate-100">
                  <td className="py-2 pr-3">SUM</td>
                  <td className="py-2 pr-3">—</td>
                  <td className="py-2 pr-3">—</td>
                  <td className="py-2 pr-3">—</td>
                  <td className="py-2 pr-3">—</td>
                  <td className="py-2 pr-3 text-cyan-300">
                    {improvedEstimate.sumWeightsPf.toFixed(3)} pF
                  </td>
                  <td className="py-2 text-cyan-200">
                    {improvedEstimate.sumWeightedPositionsMmPf.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Synchronized 3 vs 6 Electrode Comparison */}
      <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              Synchronized 3-Electrode vs. 6-Electrode Boundary Error Comparison
            </h2>
            <p className="text-xs text-slate-400">
              Evaluated at the identical finger position x = {finger.xMm.toFixed(1)} mm and across the full slider track. Wider 3-electrode pads exhibit larger edge pull-in and S-curve boundary distortion.
            </p>
          </div>
          <div className="flex gap-6 font-mono text-xs tabular-nums">
            <div>
              <span className="text-orange-300">3-Ch Est:</span>{' '}
              {twin3Electrode.positionMm !== null ? `${twin3Electrode.positionMm.toFixed(2)} mm` : '—'}{' '}
              <span className="text-slate-400">
                (err {twin3Electrode.errorMm !== null ? twin3Electrode.errorMm.toFixed(2) : '—'} mm)
              </span>
            </div>
            <div>
              <span className="text-cyan-300">6-Ch Est:</span>{' '}
              {twin6Electrode.positionMm !== null ? `${twin6Electrode.positionMm.toFixed(2)} mm` : '—'}{' '}
              <span className="text-slate-400">
                (err {twin6Electrode.errorMm !== null ? twin6Electrode.errorMm.toFixed(2) : '—'} mm)
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={linearityCurve} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="xMm"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                unit=" mm"
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                unit=" mm"
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
              <Line
                type="monotone"
                dataKey="err3"
                name="3-Electrode Position Error (mm)"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="err6"
                name="6-Electrode Position Error (mm)"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
