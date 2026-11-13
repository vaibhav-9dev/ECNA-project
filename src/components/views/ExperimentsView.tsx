import React, { useState } from 'react';
import { ArrowUpRight, PlayCircle } from 'lucide-react';
import { useSimulation } from '../../simulation/SimulationContext';
import { TouchSliderScene } from '../three/TouchSliderScene';

interface ExperimentLesson {
  id: string;
  code: string;
  title: string;
  presetId: string;
  physicalExplanation: string;
  electricalExplanation: string;
  formula: string;
  whatToObserve: string;
}

const CURRICULUM: ExperimentLesson[] = [
  {
    id: 'lesson-1',
    code: 'Lesson 01 · Exp A',
    title: 'Move a Finger Across the Sensor (Self-Capacitance Sweep)',
    presetId: 'exp-a-sweep',
    physicalExplanation:
      'A human finger acts as a conductive path coupled to earth ground. As it glides over the dielectric overlay, it intercepts fringing electric field lines emanating from the copper pads beneath.',
    electricalExplanation:
      'Each electrode exhibits a smooth bell-shaped rise in effective capacitance ΔC_i (+1.5 to +2.3 pF) atop its ~12 pF parasitic baseline C_0. Adjacent pads share charge smoothly as the finger transitions.',
    formula: 'C_total,i(x) = C_0,i + ΔC_finger · S_i(x)',
    whatToObserve:
      'Drag across the 3D PCB or watch the slow sweep: notice how consecutive electrodes rise and fall smoothly rather than switching digitally.',
  },
  {
    id: 'lesson-2',
    code: 'Lesson 02 · Exp B',
    title: 'Electrode Geometry & Stopping at a Boundary',
    presetId: 'exp-b-boundary',
    physicalExplanation:
      'When the finger rests directly above the 1.2 mm gap between E2 and E3, its ~7.5 mm contact patch bridges both copper pads equally.',
    electricalExplanation:
      'Both E2 and E3 see nearly identical ΔC (~1.1 pF each), while neighbors E1 and E4 see minimal coupling. The weighted centroid averages their centers x_2 and x_3 to resolve the exact boundary position.',
    formula: 'x_est = (x_2·w_2 + x_3·w_3) / (w_2 + w_3)',
    whatToObserve:
      'Compare E2 and E3 channel weights at x = 29.6 mm. Equal weights prove why physical overlap across gaps enables continuous interpolation.',
  },
  {
    id: 'lesson-3',
    code: 'Lesson 03 · Hover',
    title: 'Electric Field & Hover vs. Physical Contact',
    presetId: 'exp-hover',
    physicalExplanation:
      'Lifting the finger 3.5 mm above the overlay introduces an air gap (ε_r = 1.0) in series with the dielectric overlay (ε_r ≈ 3.8).',
    electricalExplanation:
      'Series capacitance drops sharply because air has nearly 4× lower permittivity than acrylic/FR-4. ΔC falls below the touch threshold, distinguishing intentional touch from hover.',
    formula: 'C_eq ∝ 1 / (d_overlay / ε_r + h_air / 1.0)',
    whatToObserve:
      'Try lowering Finger Height from 3.5 mm down to 0.0 mm and watch the conceptual field lines intensify and cross the touch threshold.',
  },
  {
    id: 'lesson-4',
    code: 'Lesson 04 · Exp C',
    title: 'Increasing Channel Noise & Jitter',
    presetId: 'exp-c-noise',
    physicalExplanation:
      'Power-supply ripple, display switching EMI, and 50/60 Hz mains coupling inject random charge fluctuations into the high-impedance sensor traces.',
    electricalExplanation:
      'Even ±0.22 pF RMS noise on a stationary finger causes fluctuating weights w_i, shaking the estimated centroid back and forth and risking false touches when idle.',
    formula: 'w_i(t) = max(0, ΔC_i + η_i(t) - T_floor)',
    whatToObserve:
      'Observe the raw estimate jittering around 45 mm while the finger is held perfectly still.',
  },
  {
    id: 'lesson-5',
    code: 'Lesson 05 · Exp D',
    title: 'Adjacent-Electrode Coupling (Crosstalk)',
    presetId: 'exp-d-coupling',
    physicalExplanation:
      'Routing sensor traces closely side-by-side creates mutual parasitic capacitance between neighboring channels.',
    electricalExplanation:
      'A finger pressing near the outer edge (E1) bleeds ~36% of its signal into E2, pulling the estimated centroid inward toward the middle of the slider and compressing the usable range.',
    formula: 'ΔC_coupled,i = (1 - α)ΔC_i + (α/2)(ΔC_{i-1} + ΔC_{i+1})',
    whatToObserve:
      'Compare the Raw position (pulled inward from 12 mm) against the Clean Ideal peak at E1.',
  },
  {
    id: 'lesson-6',
    code: 'Lesson 06 · Exp E',
    title: 'Unequal Parasitic Capacitances & Baseline Offset',
    presetId: 'exp-e-parasitics',
    physicalExplanation:
      'Longer PCB traces, vias near ground pours, or nearby metallic components give each electrode a different resting capacitance C_0,i.',
    electricalExplanation:
      'Without per-channel calibration, channels with higher resting capacitance (+1.8 pF) always appear "touched", creating permanent false touches or heavily skewed centroid estimates.',
    formula: 'ΔC_cal,i = C_meas,i - C_cal,i',
    whatToObserve:
      'Watch Raw Estimate fail due to uncalibrated parasitic offsets, then click Capture Baseline in Signal Lab to zero them out.',
  },
  {
    id: 'lesson-7',
    code: 'Lesson 07 · Exp F',
    title: 'Three vs. Six Electrodes Resolution Comparison',
    presetId: 'exp-f-3vs6',
    physicalExplanation:
      'Using only 3 wide electrodes over a 90 mm track leaves ~30 mm pitch between centers—wider than a 15 mm fingertip diameter.',
    electricalExplanation:
      'When the finger sits near the center of a wide pad, adjacent pads receive almost zero signal, causing "staircasing" or flat-spot distortion compared to 6 narrower 14 mm pads.',
    formula: 'Pitch_3ch = L/3 vs. Pitch_6ch = L/6',
    whatToObserve:
      'Open Algorithm Lab or watch the 3-ch vs 6-ch error numbers below as the finger sweeps across pad centers.',
  },
  {
    id: 'lesson-8',
    code: 'Lesson 08 · Double',
    title: 'Multi-Touch Limitation on 1D Self-Capacitance Sliders',
    presetId: 'exp-double',
    physicalExplanation:
      'A 1D linear array of electrodes only measures total capacitance per pad along one axis; it has no second spatial dimension to separate simultaneous contacts.',
    electricalExplanation:
      'Two fingers at 24 mm and 66 mm produce two peaks in w_i, but a single weighted centroid formula collapses both peaks into their midpoint (~45 mm)—a phantom single touch.',
    formula: 'x_est = (w_A·x_A + w_B·x_B) / (w_A + w_B)',
    whatToObserve:
      'Notice both 3D fingers touching outer pads while the cyan centroid marker settles right in the empty middle!',
  },
  {
    id: 'lesson-9',
    code: 'Lesson 09 · Exp G',
    title: 'Improvements & Filtering Under Combined Non-Idealities',
    presetId: 'exp-g-filtering',
    physicalExplanation:
      'Real-world touch controllers combine hardware guarding with firmware calibration, coupling matrix deconvolution, noise thresholding, and low-pass filtering.',
    electricalExplanation:
      'Per-channel baseline subtraction removes parasitics and slow drift; tridiagonal deconvolution restores edge range; EMA filtering attenuates high-frequency jitter.',
    formula: 'x_filt[k] = α · x_est[k] + (1 - α) · x_filt[k-1]',
    whatToObserve:
      'All 4 non-idealities are active simultaneously! Check the Performance tab to compare Before vs. After MAE and False Touch count.',
  },
];

export const ExperimentsView: React.FC = () => {
  const {
    applyExperimentPreset,
    activeExperimentId,
    tickOutput,
    finger,
    setActiveSection,
  } = useSimulation();

  const [selectedId, setSelectedId] = useState<string>(CURRICULUM[0].id);

  const activeLesson = CURRICULUM.find((c) => c.id === selectedId) ?? CURRICULUM[0];
  const { rawEstimate, improvedEstimate, twin3Electrode, twin6Electrode } = tickOutput;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Guided Lessons &amp; Interactive Experiments
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Nine structured engineering lessons paired with live interactive experiments (A–G). Load any experiment to configure the shared 3D physics engine and observe real-time effects.
          </p>
        </div>
        <button
          onClick={() => setActiveSection('performance')}
          className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:border-cyan-500/60"
        >
          <span>View Telemetry Dashboard</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Curriculum List */}
        <div className="space-y-2 lg:col-span-4">
          {CURRICULUM.map((lesson) => {
            const isSelected = lesson.id === selectedId;
            const isPresetLoaded = activeExperimentId === lesson.presetId;
            return (
              <button
                key={lesson.id}
                onClick={() => {
                  setSelectedId(lesson.id);
                  applyExperimentPreset(lesson.presetId);
                }}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-950/25'
                    : 'border-slate-800 bg-[#0b111d] hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className={isSelected ? 'text-cyan-300' : 'text-slate-400'}>
                    {lesson.code}
                  </span>
                  {isPresetLoaded && <span className="text-emerald-300">ACTIVE</span>}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-100">{lesson.title}</div>
              </button>
            );
          })}
        </div>

        {/* Active Lesson & Live Interactive 3D Stage */}
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="font-mono text-xs text-cyan-300">{activeLesson.code}</div>
                <h2 className="font-display mt-0.5 text-xl font-semibold text-slate-100">
                  {activeLesson.title}
                </h2>
              </div>

              <button
                onClick={() => applyExperimentPreset(activeLesson.presetId)}
                className="flex items-center gap-1.5 rounded bg-cyan-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors"
              >
                <PlayCircle className="h-4 w-4" />
                <span>Run This Experiment</span>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Physical Mechanism
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {activeLesson.physicalExplanation}
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Electrical &amp; Signal Effect
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {activeLesson.electricalExplanation}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-[#070b12] px-3.5 py-2.5">
              <div className="font-mono text-xs text-amber-200">{activeLesson.formula}</div>
              <div className="text-xs text-slate-300">{activeLesson.whatToObserve}</div>
            </div>
          </div>

          {/* Embedded Live 3D Interactive Stage + Synchronized Metrics */}
          <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-3">
            <div className="h-[340px] w-full overflow-hidden rounded border border-slate-800/80">
              <TouchSliderScene />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-800 pt-3 font-mono text-xs tabular-nums sm:grid-cols-5">
              <div>
                <div className="text-[10px] text-slate-500">ACTUAL X</div>
                <div className="text-emerald-300">{finger.xMm.toFixed(1)} mm</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">RAW EST</div>
                <div className="text-amber-300">
                  {rawEstimate.positionMm !== null ? `${rawEstimate.positionMm.toFixed(1)} mm` : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">IMPROVED EST</div>
                <div className="text-cyan-300">
                  {improvedEstimate.positionMm !== null
                    ? `${improvedEstimate.positionMm.toFixed(1)} mm`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">3-CH ERR</div>
                <div className="text-orange-300">
                  {twin3Electrode.errorMm !== null ? `${twin3Electrode.errorMm.toFixed(2)} mm` : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">6-CH ERR</div>
                <div className="text-cyan-300">
                  {twin6Electrode.errorMm !== null ? `${twin6Electrode.errorMm.toFixed(2)} mm` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
