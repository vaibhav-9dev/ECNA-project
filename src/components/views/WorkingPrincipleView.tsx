import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSimulation } from '../../simulation/SimulationContext';
import {
  computeCleanDeltas,
  computeElectrodeLayout,
  evaluateSpatialSensitivity,
} from '../../simulation/sensorEngine';

const CHANNEL_COLORS = ['#22d3ee', '#f59e0b', '#34d399', '#a78bfa', '#fb7185', '#38bdf8'];

export const WorkingPrincipleView: React.FC = () => {
  const { geometry, setGeometry, finger, setFinger, setTouchMode, tickOutput } = useSimulation();

  const layout = useMemo(
    () =>
      computeElectrodeLayout(
        geometry.electrodeCount,
        geometry.sliderLengthMm,
        geometry.electrodeGapMm
      ),
    [geometry.electrodeCount, geometry.sliderLengthMm, geometry.electrodeGapMm]
  );

  // Sample spatial sensitivity curves across the entire track [0..sliderLengthMm]
  const spatialCurves = useMemo(() => {
    const points: Record<string, number>[] = [];
    const sigmaEff = Math.sqrt(
      geometry.fingerRadiusMm * geometry.fingerRadiusMm +
        0.65 * Math.pow(geometry.overlayThicknessMm + finger.heightMm, 2)
    );
    const steps = 60;
    for (let s = 0; s <= steps; s++) {
      const x = (s / steps) * geometry.sliderLengthMm;
      const row: Record<string, number> = { xMm: Number(x.toFixed(1)) };
      for (const pad of layout) {
        row[pad.label] = Number(
          evaluateSpatialSensitivity(x, pad.startMm, pad.endMm, sigmaEff).toFixed(3)
        );
      }
      points.push(row);
    }
    return points;
  }, [geometry, finger.heightMm, layout]);

  const { cleanDeltas } = useMemo(
    () => computeCleanDeltas(geometry.electrodeCount, geometry, finger),
    [geometry, finger]
  );

  const strongest = tickOutput.channels[tickOutput.strongestChannelIndex];
  const svgW = 680;
  const svgH = 270;
  const padX = 48;
  const trackPxW = svgW - 2 * padX;
  const fingerSvgX = padX + (finger.xMm / geometry.sliderLengthMm) * trackPxW;
  const overlayPxH = Math.max(8, geometry.overlayThicknessMm * 14);
  const hoverPx = finger.isTouching ? 0 : Math.min(54, finger.heightMm * 7);
  const overlayTopY = 165 - overlayPxH;
  const fingerBottomY = overlayTopY - hoverPx;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Electrostatic Working Principle
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Self-capacitance sensing measures how a grounded human finger alters the fringing electric field above copper PCB electrodes through a protective dielectric overlay.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
          <span>Active Track: {geometry.sliderLengthMm} mm</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>Peak ΔC: {Math.max(...cleanDeltas).toFixed(3)} pF</span>
        </div>
      </div>

      {/* Main Split: Interactive Cross-Section Diagram + Parameter Controls */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <h2 className="text-sm font-semibold text-slate-200">
              Live Cross-Section &amp; Parallel Capacitance Model
            </h2>
            <span className="text-[11px] font-mono text-slate-400">
              Conceptual Fringing Field (Not an FEM Solver)
            </span>
          </div>

          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full min-w-[540px] rounded border border-slate-800/80 bg-[#070b12]">
              {/* Air region label */}
              <text x={14} y={24} fill="#64748b" fontSize="11" fontFamily="IBM Plex Mono">
                AIR (εr = 1.0)
              </text>

              {/* Protective Dielectric Overlay */}
              <rect
                x={padX - 16}
                y={overlayTopY}
                width={trackPxW + 32}
                height={overlayPxH}
                fill="rgba(34, 211, 238, 0.14)"
                stroke="#22d3ee"
                strokeWidth="1"
              />
              <text
                x={padX + trackPxW + 22}
                y={overlayTopY + overlayPxH * 0.65}
                fill="#67e8f9"
                fontSize="10"
                fontFamily="IBM Plex Mono"
              >
                Overlay {geometry.overlayThicknessMm.toFixed(1)}mm
              </text>

              {/* Copper Electrodes */}
              {layout.map((pad, idx) => {
                const x1 = padX + (pad.startMm / geometry.sliderLengthMm) * trackPxW;
                const w = ((pad.endMm - pad.startMm) / geometry.sliderLengthMm) * trackPxW;
                const isPeak = idx === tickOutput.strongestChannelIndex && tickOutput.improvedEstimate.detected;
                return (
                  <g key={pad.label}>
                    <rect
                      x={x1}
                      y={165}
                      width={w}
                      height={10}
                      fill={isPeak ? '#22d3ee' : '#d97742'}
                      rx="1"
                    />
                    <text
                      x={x1 + w * 0.5}
                      y={192}
                      textAnchor="middle"
                      fill={isPeak ? '#67e8f9' : '#cbd5e1'}
                      fontSize="11"
                      fontFamily="IBM Plex Mono"
                    >
                      {pad.label}
                    </text>

                    {/* Conceptual fringing arcs */}
                    <path
                      d={`M ${x1 + w * 0.25} 165 Q ${x1 + w * 0.5} ${overlayTopY - 16} ${x1 + w * 0.75} 165`}
                      fill="none"
                      stroke={isPeak ? '#22d3ee' : '#0284c7'}
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                      opacity={0.7}
                    />
                  </g>
                );
              })}

              {/* FR-4 Substrate */}
              <rect x={padX - 16} y={175} width={trackPxW + 32} height={36} fill="#102a2e" stroke="#1e293b" />
              <text x={padX} y={205} fill="#6ee7b7" fontSize="10" fontFamily="IBM Plex Mono">
                FR-4 PCB SUBSTRATE ({geometry.pcbThicknessMm.toFixed(1)} mm)
              </text>

              {/* Bottom Ground Plane */}
              <rect x={padX - 16} y={211} width={trackPxW + 32} height={8} fill="#b45309" />
              <text x={padX} y={233} fill="#fbbf24" fontSize="10" fontFamily="IBM Plex Mono">
                GROUND SHIELD PLANE (C0 baseline coupling)
              </text>

              {/* Virtual Finger */}
              <g transform={`translate(${fingerSvgX}, ${fingerBottomY})`}>
                <path
                  d="M -22 -70 L -22 -14 C -22 2 22 2 22 -14 L 22 -70 Z"
                  fill="#e0a990"
                  stroke="#f5d0c5"
                  strokeWidth="1.2"
                />
                <text x={0} y={-28} textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="600" fontFamily="IBM Plex Mono">
                  FINGER
                </text>
                <text x={0} y={-14} textAnchor="middle" fill="#0f172a" fontSize="9" fontFamily="IBM Plex Mono">
                  (GND)
                </text>
                {/* Finger coupling field lines */}
                <path d="M -12 0 Q -14 14 -16 26" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
                <path d="M 0 0 L 0 26" fill="none" stroke="#22d3ee" strokeWidth="1.8" />
                <path d="M 12 0 Q 14 14 16 26" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
              </g>
            </svg>
          </div>

          {/* Interactive Scrubbers right beneath diagram */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Finger Position X</span>
                <span className="tabular-nums text-cyan-300">{finger.xMm.toFixed(1)} mm</span>
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
                className="mt-1.5 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Hover Air Gap h</span>
                <span className="tabular-nums text-amber-300">{finger.heightMm.toFixed(1)} mm</span>
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
                className="mt-1.5 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Overlay Thickness d</span>
                <span className="tabular-nums text-emerald-300">{geometry.overlayThicknessMm.toFixed(1)} mm</span>
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
                className="mt-1.5 w-full"
              />
            </div>
          </div>
        </div>

        {/* Mathematical Equations & Physical Intuition */}
        <div className="space-y-4 rounded-lg border border-slate-800 bg-[#0b111d] p-4 lg:col-span-4">
          <h2 className="text-sm font-semibold text-slate-200">
            Capacitance &amp; Dielectric Equations
          </h2>

          <div className="space-y-3 text-xs leading-relaxed text-slate-300">
            <div className="rounded border border-slate-800 bg-[#070b12] p-3 font-mono text-[11px] text-cyan-200">
              C_total,i(x) = C_0,i + ΔC_finger,i(x, d_ov, h)
            </div>
            <p>
              Without a finger, each copper pad forms a baseline parasitic capacitance{' '}
              <span className="font-mono text-slate-100">C_0,i ≈ {strongest?.baselineNominalPf.toFixed(1)} pF</span> to the PCB ground plane and surrounding traces.
            </p>

            <div className="rounded border border-slate-800 bg-[#070b12] p-3 font-mono text-[11px] text-amber-200">
              C_finger ∝ ε₀ · A_overlap / (d_ov / ε_r + h_air)
            </div>
            <p>
              Because air has <span className="font-mono text-slate-100">ε_r = 1.0</span> while an acrylic/glass overlay has{' '}
              <span className="font-mono text-slate-100">ε_r ≈ {geometry.overlayPermittivity.toFixed(1)}</span>, even a small air gap{' '}
              <span className="font-mono text-slate-100">h</span> dramatically reduces the capacitive signal <span className="font-mono text-slate-100">ΔC</span>.
            </p>

            <div className="border-t border-slate-800 pt-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Live Strongest Channel ({strongest?.label})
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
                <div>Baseline C₀: {strongest?.baselineNominalPf.toFixed(2)} pF</div>
                <div className="text-cyan-300">Finger ΔC: +{strongest?.cleanDeltaPf.toFixed(3)} pF</div>
                <div>Sensitivity S: {((strongest?.spatialSensitivity ?? 0) * 100).toFixed(0)}%</div>
                <div>Total C: {strongest?.totalCapacitancePf.toFixed(3)} pF</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spatial Sensitivity Profile Graph S_i(x) */}
      <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              Spatial Sensitivity Profile S_i(x) Across Electrodes
            </h2>
            <p className="text-xs text-slate-400">
              Integrated Gaussian overlap over each electrode width. Adjacent overlap is essential so the weighted centroid can interpolate smoothly between pad centers.
            </p>
          </div>
          <div className="font-mono text-xs text-emerald-300 tabular-nums">
            Finger Cursor: x = {finger.xMm.toFixed(1)} mm
          </div>
        </div>

        <div className="h-[270px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spatialCurves} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="xMm"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                unit=" mm"
              />
              <YAxis
                domain={[0, 1.05]}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0b111d',
                  borderColor: '#334155',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                }}
              />
              <ReferenceLine
                x={Number(finger.xMm.toFixed(1))}
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="4 2"
                label={{ value: 'Finger', fill: '#34d399', fontSize: 11, position: 'top' }}
              />
              {layout.map((pad, idx) => (
                <Line
                  key={pad.label}
                  type="monotone"
                  dataKey={pad.label}
                  stroke={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
