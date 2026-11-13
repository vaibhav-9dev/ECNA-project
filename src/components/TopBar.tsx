import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useSimulation } from '../simulation/SimulationContext';
import { NavSection } from '../simulation/types';

const NAV_ITEMS: { id: NavSection; label: string }[] = [
  { id: 'sensor-3d', label: '3D Sensor' },
  { id: 'working-principle', label: 'Working Principle' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'signal-lab', label: 'Signal Laboratory' },
  { id: 'algorithm-lab', label: 'Algorithm Laboratory' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'performance', label: 'Performance' },
];

export const TopBar: React.FC = () => {
  const {
    activeSection,
    setActiveSection,
    isPlaying,
    setIsPlaying,
    simSpeed,
    setSimSpeed,
    resetSimulation,
    isReplaying,
    stopReplay,
  } = useSimulation();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#070b12]/95 px-4 py-2.5 lg:px-6">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6">
        {/* Zone 1: Brand Title */}
        <button
          onClick={() => setActiveSection('sensor-3d')}
          className="font-display shrink-0 whitespace-nowrap text-left text-base font-semibold tracking-tight text-slate-100 hover:text-cyan-300 transition-colors"
        >
          CapSense Lab
        </button>

        {/* Zone 2: Primary Navigation Links */}
        <nav
          aria-label="Laboratory Modules"
          className="flex items-center gap-1 overflow-x-auto py-0.5 sm:gap-2"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-[13px] ${
                  active
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Simulation Transport Action */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1.5 border border-slate-800 bg-slate-900/80 px-2 py-1 rounded text-[11px] font-mono text-slate-300 xl:flex">
            <span className="text-slate-500">Speed</span>
            <select
              aria-label="Simulation speed"
              value={simSpeed}
              onChange={(e) => setSimSpeed(Number(e.target.value))}
              className="bg-transparent text-cyan-300 focus:outline-none"
            >
              <option value={0.25} className="bg-slate-900">0.25x</option>
              <option value={0.5} className="bg-slate-900">0.5x</option>
              <option value={1} className="bg-slate-900">1.0x</option>
              <option value={2} className="bg-slate-900">2.0x</option>
              <option value={3} className="bg-slate-900">3.0x</option>
            </select>
          </div>

          <button
            onClick={() => {
              if (isReplaying) stopReplay();
              setIsPlaying(!isPlaying);
            }}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-cyan-500/60 hover:text-cyan-200 transition-colors"
            title={isPlaying ? 'Pause simulation' : 'Resume simulation'}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5 text-cyan-400" /> : <Play className="h-3.5 w-3.5 text-emerald-400" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={resetSimulation}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
            title="Reset simulation state and clear telemetry history"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
};
