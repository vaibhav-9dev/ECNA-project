import React, { useMemo } from 'react';
import { Download, Play, RotateCcw, Square } from 'lucide-react';
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

const CHANNEL_COLORS = ['#22d3ee', '#f59e0b', '#34d399', '#a78bfa', '#fb7185', '#38bdf8'];

export const PerformanceView: React.FC = () => {
  const {
    history,
    metrics,
    tickOutput,
    isPlaying,
    setIsPlaying,
    isReplaying,
    startReplay,
    stopReplay,
    resetSimulation,
  } = useSimulation();

  const chartData = useMemo(
    () =>
      history.map((s) => {
        const row: Record<string, number | null> = {
          t: s.t,
          actual: Number(s.actualXMm.toFixed(2)),
          rawPos: s.rawPosMm !== null ? Number(s.rawPosMm.toFixed(2)) : null,
          impPos: s.improvedPosMm !== null ? Number(s.improvedPosMm.toFixed(2)) : null,
          rawErr: s.rawErrorMm !== null ? Number(s.rawErrorMm.toFixed(2)) : null,
          impErr: s.improvedErrorMm !== null ? Number(s.improvedErrorMm.toFixed(2)) : null,
        };
        s.channelsPf.forEach((c, idx) => {
          row[`C${idx + 1}`] = Number(c.toFixed(3));
        });
        s.distortedSignalsPf.forEach((d, idx) => {
          row[`D${idx + 1}`] = Number(d.toFixed(3));
        });
        return row;
      }),
    [history]
  );

  const exportCsv = () => {
    if (history.length === 0) return;
    const header = [
      'time_s',
      'actual_x_mm',
      'is_touching',
      'raw_est_mm',
      'improved_est_mm',
      'raw_err_mm',
      'improved_err_mm',
      ...tickOutput.channels.map((c) => `${c.label}_total_pF`),
    ].join(',');
    const rows = history.map((s) =>
      [
        s.t,
        s.actualXMm.toFixed(3),
        s.isTouching ? 1 : 0,
        s.rawPosMm !== null ? s.rawPosMm.toFixed(3) : '',
        s.improvedPosMm !== null ? s.improvedPosMm.toFixed(3) : '',
        s.rawErrorMm !== null ? s.rawErrorMm.toFixed(3) : '',
        s.improvedErrorMm !== null ? s.improvedErrorMm.toFixed(3) : '',
        ...s.channelsPf.map((v) => v.toFixed(4)),
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `capsense_telemetry_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 lg:p-6">
      {/* Header + Transport Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Performance Comparison &amp; Telemetry Dashboard
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Before-vs-after improvement metrics comparing the uncalibrated raw centroid against baseline calibration, coupling compensation, and temporal filtering.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/60"
          >
            <Play className="h-3.5 w-3.5 text-cyan-400" />
            <span>{isPlaying ? 'Pause' : 'Resume'}</span>
          </button>

          {!isReplaying ? (
            <button
              onClick={startReplay}
              disabled={history.length < 2}
              className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/60 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              <span>Replay Trace ({history.length})</span>
            </button>
          ) : (
            <button
              onClick={stopReplay}
              className="flex items-center gap-1.5 rounded border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200"
            >
              <Square className="h-3.5 w-3.5" />
              <span>Stop Replay</span>
            </button>
          )}

          <button
            onClick={resetSimulation}
            className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          <button
            onClick={exportCsv}
            disabled={history.length === 0}
            className="flex items-center gap-1.5 rounded border border-cyan-500/60 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Before vs After KPI Comparison Matrix */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Mean Abs Error</div>
          <div className="mt-1 font-mono text-xl font-semibold text-cyan-300 tabular-nums">
            {metrics.improvedMaeMm.toFixed(2)} <span className="text-xs text-slate-400">mm</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-amber-300 tabular-nums">
            Before: {metrics.rawMaeMm.toFixed(2)} mm
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Max Position Error</div>
          <div className="mt-1 font-mono text-xl font-semibold text-cyan-300 tabular-nums">
            {metrics.improvedMaxErrorMm.toFixed(2)} <span className="text-xs text-slate-400">mm</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-amber-300 tabular-nums">
            Before: {metrics.rawMaxErrorMm.toFixed(2)} mm
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">False Touches</div>
          <div className="mt-1 font-mono text-xl font-semibold text-emerald-300 tabular-nums">
            {metrics.improvedFalseTouches}
          </div>
          <div className="mt-1 font-mono text-[11px] text-rose-400 tabular-nums">
            Before: {metrics.rawFalseTouches}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Missed Touches</div>
          <div className="mt-1 font-mono text-xl font-semibold text-emerald-300 tabular-nums">
            {metrics.improvedMissedTouches}
          </div>
          <div className="mt-1 font-mono text-[11px] text-amber-300 tabular-nums">
            Before: {metrics.rawMissedTouches}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Signal Stability (σ)</div>
          <div className="mt-1 font-mono text-xl font-semibold text-cyan-300 tabular-nums">
            {metrics.improvedStabilityStdMm.toFixed(2)} <span className="text-xs text-slate-400">mm</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-amber-300 tabular-nums">
            Before: {metrics.rawStabilityStdMm.toFixed(2)} mm
          </div>
        </div>
      </div>

      {/* 4 Synchronized Real-Time Telemetry Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Actual vs Estimated Position */}
        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            Actual vs. Estimated Position Over Time (mm)
          </h2>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="t" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit="s" />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" mm" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0b111d',
                    borderColor: '#334155',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'IBM Plex Mono' }} />
                <Line type="monotone" dataKey="actual" name="Actual Finger X" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="rawPos" name="Raw Uncalibrated" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="impPos" name="Improved Centroid" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Position Error Over Time */}
        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            Absolute Position Error |x - x_est| (mm)
          </h2>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="t" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit="s" />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" mm" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0b111d',
                    borderColor: '#334155',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'IBM Plex Mono' }} />
                <Line type="monotone" dataKey="rawErr" name="Raw Error (Before)" stroke="#f59e0b" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="impErr" name="Improved Error (After)" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Electrode Signal Graph (Delta C) */}
        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            Electrode Signal Response ΔC_i (pF)
          </h2>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="t" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit="s" />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" pF" />
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
                    dataKey={`D${idx + 1}`}
                    name={ch.label}
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

        {/* 4. Total Capacitance Graph */}
        <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            Total Node Capacitance C_total,i (pF)
          </h2>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="t" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit="s" />
                <YAxis domain={['auto', 'auto']} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" pF" />
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
                    dataKey={`C${idx + 1}`}
                    name={ch.label}
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
  );
};
