import React, { useMemo, useState } from 'react';
import { useSimulation } from '../../simulation/SimulationContext';

type CircuitNodeId =
  | 'excitation'
  | 'sensor-pad'
  | 'virtual-ground'
  | 'opamp-stage'
  | 'demod-lpf'
  | 'adc-mcu';

interface NodeExplanation {
  id: CircuitNodeId;
  title: string;
  subtitle: string;
  whyItMatters: string;
  designTradeoff: string;
}

const NODE_EXPLANATIONS: Record<CircuitNodeId, NodeExplanation> = {
  excitation: {
    id: 'excitation',
    title: '1. AC Excitation Drive (V_exc, f_exc)',
    subtitle: 'Controlled Periodic Stimulus',
    whyItMatters:
      'A static DC voltage produces zero steady-state current through a capacitor (I = C · dV/dt). Driving the electrode with a 50–500 kHz AC waveform turns picofarad capacitance into a measurable microampere reactive current.',
    designTradeoff:
      'Higher f_exc or V_exc increases signal current I_sense linearly, improving SNR, but raises EMI emissions and pushes the op-amp closer to bandwidth and slew-rate limits.',
  },
  'sensor-pad': {
    id: 'sensor-pad',
    title: '2. Capacitive Electrode & Finger Model (C_0 + ΔC)',
    subtitle: 'Physical Transducer Equivalent Circuit',
    whyItMatters:
      'Each copper pad exhibits ~12 pF of baseline parasitic capacitance C_0 to the PCB ground shield, plus any unequal trace parasitics C_par and adjacent-pad crosstalk C_couple. A touching finger adds a small ΔC(x) (+0.2 to +2.5 pF) to earth/body ground.',
    designTradeoff:
      'Because ΔC is only 2–15% of C_0, the readout circuit must subtract or balance out the large static baseline before applying high analog gain, otherwise C_0 alone would saturate the amplifier.',
  },
  'virtual-ground': {
    id: 'virtual-ground',
    title: '3. Non-Inverting Bias & Virtual Ground (V_bias = V_DD / 2)',
    subtitle: 'Single-Supply Mid-Rail Reference',
    whyItMatters:
      'Because microcontrollers and touch AFEs typically run on a single 0 V to 3.3 V supply, the op-amp non-inverting (+) pin is biased at V_bias = 1.65 V. Negative feedback forces the inverting (-) summing node to track V(-) ≈ V(+) = 1.65 V.',
    designTradeoff:
      'Pinning the sensor node at a constant virtual ground minimizes voltage swing across parasitic PCB capacitance and lets the op-amp output swing both above and below 1.65 V without negative power rails.',
  },
  'opamp-stage': {
    id: 'opamp-stage',
    title: '4. Op-Amp Readout Stage (U1 with Rf || Cf)',
    subtitle: 'Current-to-Voltage (TIA) or Charge-to-Voltage Integrator',
    whyItMatters:
      'The inverting op-amp stage routes all reactive sensor current through the feedback network (Rf || Cf). In TIA mode, V_out scales with |Z_f|; in Switched-Cap Charge Integrator mode, charge ΔQ = V_exc · ΔC transfers onto C_f so ΔV_out = (V_exc / C_f) · ΔC.',
    designTradeoff:
      'Increasing Rf (in TIA) or decreasing Cf (in Charge Integrator) boosts sensitivity (V/pF), but too much gain causes the op-amp output to clip at the 3.3 V supply rail during strong finger contact.',
  },
  'demod-lpf': {
    id: 'demod-lpf',
    title: '5. Synchronous Demodulator & Anti-Aliasing LPF',
    subtitle: 'Carrier Extraction & Noise Rejection',
    whyItMatters:
      'A synchronous switch/mixer locked to f_exc rectifies the high-frequency carrier, and the RC low-pass filter strips carrier harmonics and 50/60 Hz mains interference, leaving a clean baseband envelope proportional to ΔC.',
    designTradeoff:
      'A lower LPF cutoff suppresses random noise effectively, but too heavy a filter introduces phase lag when the user swipes rapidly across the slider.',
  },
  'adc-mcu': {
    id: 'adc-mcu',
    title: '6. N-Bit ADC & MCU Weighted-Centroid DSP',
    subtitle: 'Quantization, Calibration & Position Estimation',
    whyItMatters:
      'The ADC samples V_cond into discrete integers [0, 2^N − 1]. Firmware subtracts the calibrated baseline C_cal,i, compensates adjacent crosstalk, applies a noise deadband floor, and computes x_est = Σ(x_i · w_i) / Σ(w_i).',
    designTradeoff:
      '10-bit ADCs show visible quantization steps at low ΔC, whereas 12-bit or 14-bit ADCs preserve fine sub-millimeter interpolation across electrode boundaries.',
  },
};

export const CircuitDiagramView: React.FC = () => {
  const {
    electronics,
    setElectronics,
    tickOutput,
    finger,
    setFinger,
    geometry,
    setTouchMode,
    setActiveSection,
  } = useSimulation();

  const [selectedNode, setSelectedNode] = useState<CircuitNodeId>('opamp-stage');
  const [probedChannelIdx, setProbedChannelIdx] = useState<number | 'auto'>('auto');

  const activeIdx =
    probedChannelIdx === 'auto'
      ? tickOutput.strongestChannelIndex
      : Math.min(probedChannelIdx, tickOutput.channels.length - 1);
  const ch = tickOutput.channels[activeIdx] ?? tickOutput.channels[0];

  const adcMax = Math.pow(2, electronics.adcBits) - 1;
  const omega = 2 * Math.PI * electronics.excitationFreqKHz * 1e3;
  const rfOhms = electronics.feedbackResistanceKOhm * 1e3;
  const cfFarads = electronics.feedbackCapPf * 1e-12;
  const zfKOhm = (rfOhms / Math.sqrt(1 + Math.pow(omega * rfOhms * cfFarads, 2))) / 1e3;
  const cornerFreqKHz = 1 / (2 * Math.PI * rfOhms * cfFarads) / 1e3;

  const isTia = electronics.opAmpTopology === 'tia';
  const isSaturated = ch?.opAmpSaturated ?? false;

  const activeMeta = NODE_EXPLANATIONS[selectedNode];

  const liveFormulaText = useMemo(() => {
    if (!ch) return '';
    switch (selectedNode) {
      case 'excitation':
        return `V_amp = ${electronics.excitationVoltageV.toFixed(1)} / 2 = ${(electronics.excitationVoltageV * 0.5).toFixed(2)} Vpk  @  f_exc = ${electronics.excitationFreqKHz} kHz (ω = ${(omega / 1e6).toFixed(2)} Mrad/s)`;
      case 'sensor-pad':
        return `${ch.label}: C_total = ${ch.baselineNominalPf.toFixed(1)} (C0) + ${ch.parasiticOffsetPf.toFixed(2)} (C_par) + ${ch.cleanDeltaPf.toFixed(2)} (ΔC_finger) ≈ ${ch.totalCapacitancePf.toFixed(2)} pF  |  I_sense = ${ch.excitationCurrentUa.toFixed(1)} µA`;
      case 'virtual-ground':
        return `V(+) = V_bias = ${ch.opAmpVirtualGndV.toFixed(2)} V  ⇒  V(-) ≈ ${ch.opAmpVirtualGndV.toFixed(2)} V (Virtual Ground inside ${electronics.vRef.toFixed(1)} V rail)`;
      case 'opamp-stage':
        if (isTia) {
          return `|Z_f| = ${zfKOhm.toFixed(1)} kΩ (f_c = ${cornerFreqKHz.toFixed(0)} kHz)  |  Gain = ${ch.opAmpGainVPerPf.toFixed(2)} V/pF  ⇒  V_out = clamp(1.65 + ${ch.opAmpDeltaV.toFixed(2)}) = ${ch.opAmpOutV.toFixed(2)} V${isSaturated ? ' [RAIL CLIP]' : ''}`;
        }
        return `ΔV/ΔC ≈ (V_exc / C_f)·PGA = ${ch.opAmpGainVPerPf.toFixed(2)} V/pF  ⇒  V_out = clamp(1.65 + ${ch.opAmpDeltaV.toFixed(2)}) = ${ch.opAmpOutV.toFixed(2)} V${isSaturated ? ' [RAIL CLIP]' : ''}`;
      case 'demod-lpf':
        return `V_cond = ${ch.conditionedVoltageV.toFixed(3)} V  (Envelope tracked within [0.00 V, ${electronics.vRef.toFixed(1)} V])`;
      case 'adc-mcu':
        return `ADC = round((${ch.conditionedVoltageV.toFixed(2)} / ${electronics.vRef.toFixed(1)}) · ${adcMax}) = ${ch.adcCounts} counts  |  x_est = ${tickOutput.improvedEstimate.positionMm !== null ? `${tickOutput.improvedEstimate.positionMm.toFixed(1)} mm` : 'No Touch'}`;
    }
  }, [selectedNode, ch, electronics, omega, zfKOhm, cornerFreqKHz, isTia, isSaturated, adcMax, tickOutput.improvedEstimate.positionMm]);

  const strokeFor = (id: CircuitNodeId, defaultColor = '#475569') =>
    selectedNode === id ? '#22d3ee' : defaultColor;

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Interactive Capacitive Readout Circuit Diagram
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Click any block or component in the schematic to inspect how picofarad finger capacitance changes are converted by the Op-Amp front-end (U1), demodulated, and digitized by the ADC.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-amber-300">
            Illustrative Behavioral Schematic (Not a SPICE Netlist)
          </span>
          <button
            onClick={() => setActiveSection('sensor-3d')}
            className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200"
          >
            ← Back to 3D Sensor
          </button>
        </div>
      </div>

      {/* Top Quick Bar: Probed Channel, Topology Switch, Finger Scrubber */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-800 bg-[#0b111d] p-3.5 lg:grid-cols-12 lg:items-center">
        {/* Probed Channel Selector */}
        <div className="flex flex-wrap items-center gap-1.5 lg:col-span-5">
          <span className="mr-1 text-[11px] font-mono uppercase text-slate-400">Probe:</span>
          <button
            onClick={() => setProbedChannelIdx('auto')}
            className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
              probedChannelIdx === 'auto'
                ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Auto Peak ({tickOutput.channels[tickOutput.strongestChannelIndex]?.label})
          </button>
          {tickOutput.channels.map((c, idx) => (
            <button
              key={c.label}
              onClick={() => setProbedChannelIdx(idx)}
              className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                probedChannelIdx === idx
                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Op-Amp Topology Toggle */}
        <div className="flex items-center gap-1.5 lg:col-span-3">
          <span className="text-[11px] font-mono uppercase text-slate-400">U1 Mode:</span>
          <button
            onClick={() => setElectronics((el) => ({ ...el, opAmpTopology: 'tia' }))}
            className={`flex-1 rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
              isTia
                ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            TIA (Rf || Cf)
          </button>
          <button
            onClick={() => setElectronics((el) => ({ ...el, opAmpTopology: 'charge_integrator' }))}
            className={`flex-1 rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
              !isTia
                ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Charge Integrator
          </button>
        </div>

        {/* Live Finger Position Scrubber */}
        <div className="flex items-center gap-3 lg:col-span-4">
          <button
            onClick={() => {
              setTouchMode('manual');
              setFinger((f) => ({
                ...f,
                isTouching: !f.isTouching,
                heightMm: f.isTouching ? 3.5 : 0,
              }));
            }}
            className={`shrink-0 rounded border px-2.5 py-1 text-[11px] font-mono font-medium ${
              finger.isTouching
                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                : 'border-amber-500/60 bg-amber-500/15 text-amber-200'
            }`}
          >
            {finger.isTouching ? 'TOUCHING' : 'HOVER'}
          </button>
          <div className="flex-1">
            <div className="flex justify-between text-[11px] font-mono text-slate-300">
              <span>Finger X</span>
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
                setFinger((f) => ({
                  ...f,
                  xMm: Number(e.target.value),
                  isTouching: true,
                  heightMm: 0,
                }));
              }}
              className="mt-0.5 w-full"
            />
          </div>
        </div>
      </div>

      {/* Interactive Full SVG Schematic Diagram */}
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#060a11] p-3 shadow-inner">
        <svg
          viewBox="0 0 1120 470"
          className="mx-auto min-w-[920px] w-full select-none"
          role="img"
          aria-label="Interactive capacitive touch slider readout schematic diagram"
        >
          <defs>
            <pattern id="schGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0f172a" strokeWidth="1" />
            </pattern>
            <marker id="arrowCyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#22d3ee" />
            </marker>
            <marker id="arrowSlate" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
            </marker>
          </defs>

          <rect x="0" y="0" width="1120" height="470" fill="url(#schGrid)" rx="6" />

          {/* Section Bounding Labels */}
          <text x="24" y="26" fill="#64748b" fontSize="11" fontFamily="IBM Plex Mono, monospace">
            SCHEMATIC: {ch?.label} CHANNEL EQUIVALENT + U1 OP-AMP AFE ({isTia ? 'TIA MODE' : 'CHARGE INTEGRATOR'})
          </text>
          <text x="1096" y="26" textAnchor="end" fill="#38bdf8" fontSize="11" fontFamily="IBM Plex Mono, monospace">
            CLICK ANY CIRCUIT STAGE TO INSPECT
          </text>

          {/* ================= 1. EXCITATION SOURCE ================= */}
          <g
            onClick={() => setSelectedNode('excitation')}
            className="cursor-pointer"
          >
            <rect
              x="22"
              y="72"
              width="148"
              height="270"
              rx="6"
              fill={selectedNode === 'excitation' ? 'rgba(8, 145, 178, 0.12)' : 'rgba(15, 23, 42, 0.45)'}
              stroke={strokeFor('excitation', '#1e293b')}
              strokeWidth={selectedNode === 'excitation' ? 1.8 : 1}
            />
            <text x="96" y="94" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
              Excitation Drive
            </text>

            {/* AC Voltage Source Symbol */}
            <circle cx="80" cy="210" r="24" fill="#090d16" stroke="#38bdf8" strokeWidth="2" />
            <path d="M 66 210 Q 73 196 80 210 T 94 210" fill="none" stroke="#22d3ee" strokeWidth="2" />
            <text x="80" y="250" textAnchor="middle" fill="#38bdf8" fontSize="11" fontFamily="IBM Plex Mono, monospace">
              {electronics.excitationVoltageV.toFixed(1)} Vpp
            </text>
            <text x="80" y="266" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="IBM Plex Mono, monospace">
              {electronics.excitationFreqKHz} kHz
            </text>

            {/* Ground under source */}
            <line x1="80" y1="234" x2="80" y2="302" stroke="#64748b" strokeWidth="1.8" />
            <line x1="66" y1="302" x2="94" y2="302" stroke="#64748b" strokeWidth="2" />
            <line x1="71" y1="308" x2="89" y2="308" stroke="#64748b" strokeWidth="1.8" />
            <line x1="76" y1="314" x2="84" y2="314" stroke="#64748b" strokeWidth="1.5" />

            {/* Top wire from V_exc through R_drv */}
            <line x1="80" y1="186" x2="80" y2="148" stroke="#38bdf8" strokeWidth="2" />
            <line x1="80" y1="148" x2="108" y2="148" stroke="#38bdf8" strokeWidth="2" />
            {/* R_drv Zig-Zag */}
            <polyline
              points="108,148 113,141 119,155 125,141 131,155 137,141 143,155 148,148"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.8"
            />
            <text x="128" y="134" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="IBM Plex Mono, monospace">
              R_drv
            </text>
            <line x1="148" y1="148" x2="195" y2="148" stroke="#38bdf8" strokeWidth="2" />
          </g>

          {/* ================= 2. SENSOR ELECTRODE PAD EQUIVALENT ================= */}
          <g
            onClick={() => setSelectedNode('sensor-pad')}
            className="cursor-pointer"
          >
            <rect
              x="195"
              y="72"
              width="255"
              height="332"
              rx="6"
              fill={selectedNode === 'sensor-pad' ? 'rgba(8, 145, 178, 0.12)' : 'rgba(15, 23, 42, 0.45)'}
              stroke={strokeFor('sensor-pad', '#334155')}
              strokeDasharray="6 4"
              strokeWidth={selectedNode === 'sensor-pad' ? 2 : 1.2}
            />
            <text x="322" y="94" textAnchor="middle" fill="#fb923c" fontSize="12" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
              Electrode Pad {ch?.label} Equivalent
            </text>

            {/* Main horizontal bus across pad */}
            <line x1="195" y1="148" x2="465" y2="148" stroke="#fb923c" strokeWidth="2.2" />

            {/* Node 1: C0 + Cpar Shunt Capacitor to PCB Ground */}
            <circle cx="242" cy="148" r="3.5" fill="#fb923c" />
            <line x1="242" y1="148" x2="242" y2="215" stroke="#94a3b8" strokeWidth="1.8" />
            <line x1="226" y1="215" x2="258" y2="215" stroke="#cbd5e1" strokeWidth="2.4" />
            <line x1="226" y1="225" x2="258" y2="225" stroke="#cbd5e1" strokeWidth="2.4" />
            <line x1="242" y1="225" x2="242" y2="286" stroke="#64748b" strokeWidth="1.8" />
            <line x1="228" y1="286" x2="256" y2="286" stroke="#64748b" strokeWidth="2" />
            <line x1="233" y1="292" x2="251" y2="292" stroke="#64748b" strokeWidth="1.8" />
            <line x1="238" y1="298" x2="246" y2="298" stroke="#64748b" strokeWidth="1.5" />
            <text x="242" y="318" textAnchor="middle" fill="#cbd5e1" fontSize="10.5" fontFamily="IBM Plex Mono, monospace">
              C_0 + C_par
            </text>
            <text x="242" y="334" textAnchor="middle" fill="#94a3b8" fontSize="10.5" fontFamily="IBM Plex Mono, monospace">
              {(ch.baselineNominalPf + ch.parasiticOffsetPf).toFixed(2)} pF
            </text>

            {/* Node 2: Variable Finger Capacitance ΔC(x) */}
            <circle cx="332" cy="148" r="3.5" fill="#22d3ee" />
            <line x1="332" y1="148" x2="332" y2="215" stroke="#22d3ee" strokeWidth="2" />
            <line x1="316" y1="215" x2="348" y2="215" stroke="#22d3ee" strokeWidth="2.6" />
            <line x1="316" y1="225" x2="348" y2="225" stroke="#22d3ee" strokeWidth="2.6" />
            {/* Variable capacitor diagonal arrow */}
            <line x1="312" y1="236" x2="352" y2="202" stroke="#10b981" strokeWidth="1.8" markerEnd="url(#arrowCyan)" />
            <line x1="332" y1="225" x2="332" y2="286" stroke="#10b981" strokeWidth="1.8" />
            {/* Finger Body Ground */}
            <rect x="304" y="286" width="56" height="22" rx="4" fill="#064e3b" stroke="#10b981" strokeWidth="1.2" />
            <text x="332" y="301" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontFamily="IBM Plex Mono, monospace">
              FINGER
            </text>
            <text x="332" y="325" textAnchor="middle" fill="#22d3ee" fontSize="11" fontWeight="600" fontFamily="IBM Plex Mono, monospace">
              ΔC = +{ch.cleanDeltaPf.toFixed(2)} pF
            </text>
            <text x="332" y="341" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="IBM Plex Mono, monospace">
              {finger.isTouching ? 'Contact' : `Hover ${finger.heightMm.toFixed(1)}mm`}
            </text>

            {/* Node 3: Adjacent Electrode Coupling C_couple */}
            <circle cx="408" cy="148" r="3.5" fill="#f59e0b" />
            <line x1="408" y1="148" x2="408" y2="215" stroke="#f59e0b" strokeWidth="1.6" />
            <line x1="395" y1="215" x2="421" y2="215" stroke="#f59e0b" strokeWidth="2" />
            <line x1="395" y1="225" x2="421" y2="225" stroke="#f59e0b" strokeWidth="2" />
            <line x1="408" y1="225" x2="408" y2="262" stroke="#f59e0b" strokeWidth="1.6" />
            <text x="408" y="278" textAnchor="middle" fill="#fbbf24" fontSize="10" fontFamily="IBM Plex Mono, monospace">
              C_couple
            </text>
            <text x="408" y="294" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
              to Adj. Pad
            </text>

            {/* Live Total Pad Capacitance Pill inside Schematic */}
            <rect x="224" y="362" width="198" height="28" rx="4" fill="#090d16" stroke="#334155" />
            <text x="323" y="380" textAnchor="middle" fill="#f8fafc" fontSize="11" fontFamily="IBM Plex Mono, monospace">
              C_total = {ch.totalCapacitancePf.toFixed(2)} pF
            </text>
          </g>

          {/* Current I_sense Flow Arrow */}
          <line x1="450" y1="148" x2="540" y2="148" stroke="#22d3ee" strokeWidth="2.4" markerEnd="url(#arrowCyan)" />
          <text x="495" y="135" textAnchor="middle" fill="#22d3ee" fontSize="11" fontWeight="600" fontFamily="IBM Plex Mono, monospace">
            I_sense
          </text>
          <text x="495" y="166" textAnchor="middle" fill="#a5f3fc" fontSize="11" fontFamily="IBM Plex Mono, monospace">
            {ch.excitationCurrentUa.toFixed(1)} µA
          </text>

          {/* ================= 3. VIRTUAL GROUND V_BIAS ================= */}
          <g
            onClick={() => setSelectedNode('virtual-ground')}
            className="cursor-pointer"
          >
            <rect
              x="472"
              y="222"
              width="126"
              height="182"
              rx="6"
              fill={selectedNode === 'virtual-ground' ? 'rgba(8, 145, 178, 0.14)' : 'rgba(15, 23, 42, 0.45)'}
              stroke={strokeFor('virtual-ground', '#1e293b')}
              strokeWidth={selectedNode === 'virtual-ground' ? 1.8 : 1}
            />
            <text x="535" y="242" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
              Mid-Rail Bias
            </text>
            {/* V_DD top */}
            <text x="515" y="264" textAnchor="middle" fill="#f59e0b" fontSize="10" fontFamily="IBM Plex Mono, monospace">
              V_DD ({electronics.vRef.toFixed(1)}V)
            </text>
            <line x1="515" y1="270" x2="515" y2="282" stroke="#f59e0b" strokeWidth="1.6" />
            <polyline
              points="515,282 509,286 521,291 509,296 521,301 515,305"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.6"
            />
            <line x1="515" y1="305" x2="515" y2="334" stroke="#94a3b8" strokeWidth="1.8" />
            <polyline
              points="515,334 509,338 521,343 509,348 521,353 515,357"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.6"
            />
            <line x1="515" y1="357" x2="515" y2="378" stroke="#64748b" strokeWidth="1.6" />
            <line x1="504" y1="378" x2="526" y2="378" stroke="#64748b" strokeWidth="2" />
            <line x1="508" y1="383" x2="522" y2="383" stroke="#64748b" strokeWidth="1.6" />

            {/* Node V_bias tapping out to Op-Amp (+) */}
            <circle cx="515" cy="318" r="3.5" fill="#22d3ee" />
            <line x1="515" y1="318" x2="588" y2="318" stroke="#22d3ee" strokeWidth="1.8" />
            <line x1="588" y1="318" x2="588" y2="232" stroke="#22d3ee" strokeWidth="1.8" />
            <line x1="588" y1="232" x2="612" y2="232" stroke="#22d3ee" strokeWidth="1.8" />

            <text x="556" y="306" textAnchor="middle" fill="#22d3ee" fontSize="11" fontWeight="600" fontFamily="IBM Plex Mono, monospace">
              V_bias
            </text>
            <text x="556" y="335" textAnchor="middle" fill="#a5f3fc" fontSize="11" fontFamily="IBM Plex Mono, monospace">
              {ch.opAmpVirtualGndV.toFixed(2)} V
            </text>
          </g>

          {/* ================= 4. OP-AMP READOUT STAGE U1 & FEEDBACK ================= */}
          <g
            onClick={() => setSelectedNode('opamp-stage')}
            className="cursor-pointer"
          >
            <rect
              x="546"
              y="58"
              width="256"
              height="240"
              rx="6"
              fill={selectedNode === 'opamp-stage' ? 'rgba(8, 145, 178, 0.14)' : 'rgba(15, 23, 42, 0.45)'}
              stroke={strokeFor('opamp-stage', isSaturated ? '#f59e0b' : '#334155')}
              strokeWidth={selectedNode === 'opamp-stage' || isSaturated ? 2 : 1.2}
            />
            <text x="674" y="78" textAnchor="middle" fill="#22d3ee" fontSize="12" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
              Op-Amp Readout U1 ({isTia ? 'TIA' : 'Integrator'})
            </text>

            {/* Summing Node (-) */}
            <line x1="540" y1="148" x2="612" y2="148" stroke="#22d3ee" strokeWidth="2.2" />
            <circle cx="574" cy="148" r="4" fill="#22d3ee" />
            <text x="574" y="182" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
              V(-)≈{ch.opAmpVirtualGndV.toFixed(2)}V
            </text>

            {/* Feedback Loop Wires */}
            <line x1="574" y1="148" x2="574" y2="108" stroke="#cbd5e1" strokeWidth="1.8" />
            <line x1="574" y1="108" x2="758" y2="108" stroke="#cbd5e1" strokeWidth="1.8" />
            <line x1="758" y1="108" x2="758" y2="195" stroke="#cbd5e1" strokeWidth="1.8" />
            <circle cx="758" cy="195" r="4" fill="#22d3ee" />

            {/* Parallel Branch for C_f */}
            <line x1="618" y1="108" x2="618" y2="136" stroke="#cbd5e1" strokeWidth="1.6" />
            <line x1="618" y1="136" x2="656" y2="136" stroke="#cbd5e1" strokeWidth="1.6" />
            <line x1="656" y1="125" x2="656" y2="147" stroke="#38bdf8" strokeWidth="2.4" />
            <line x1="664" y1="125" x2="664" y2="147" stroke="#38bdf8" strokeWidth="2.4" />
            <line x1="664" y1="136" x2="710" y2="136" stroke="#cbd5e1" strokeWidth="1.6" />
            <line x1="710" y1="136" x2="710" y2="108" stroke="#cbd5e1" strokeWidth="1.6" />
            <text x="660" y="158" textAnchor="middle" fill="#38bdf8" fontSize="10.5" fontFamily="IBM Plex Mono, monospace">
              Cf = {electronics.feedbackCapPf.toFixed(1)} pF
            </text>

            {/* Feedback Resistor Rf on top branch (or Reset Switch in Charge Integrator) */}
            <rect x="630" y="96" width="60" height="22" fill="#060a11" />
            <polyline
              points="630,108 636,100 644,116 652,100 660,116 668,100 676,116 684,108"
              fill="none"
              stroke={isTia ? '#fb923c' : '#64748b'}
              strokeWidth="1.8"
            />
            <text x="660" y="94" textAnchor="middle" fill={isTia ? '#fb923c' : '#94a3b8'} fontSize="10.5" fontFamily="IBM Plex Mono, monospace">
              Rf = {electronics.feedbackResistanceKOhm} kΩ{!isTia ? ' (bleed)' : ''}
            </text>

            {/* Charge Integrator Reset Switch indicator when in Charge Integrator mode */}
            {!isTia && (
              <g>
                <line x1="618" y1="136" x2="618" y2="162" stroke="#10b981" strokeWidth="1.4" strokeDasharray="3 2" />
                <line x1="710" y1="136" x2="710" y2="162" stroke="#10b981" strokeWidth="1.4" strokeDasharray="3 2" />
                <line x1="618" y1="162" x2="648" y2="162" stroke="#10b981" strokeWidth="1.4" />
                <line x1="648" y1="162" x2="674" y2="152" stroke="#10b981" strokeWidth="1.8" />
                <line x1="676" y1="162" x2="710" y2="162" stroke="#10b981" strokeWidth="1.4" />
                <text x="664" y="174" textAnchor="middle" fill="#34d399" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
                  Φ_rst
                </text>
              </g>
            )}

            {/* Op-Amp Triangle */}
            <polygon
              points="612,140 612,250 712,195"
              fill="#0b1322"
              stroke={isSaturated ? '#f59e0b' : '#22d3ee'}
              strokeWidth="2.4"
            />
            {/* Inverting (-) and Non-Inverting (+) Symbols */}
            <text x="622" y="169" fill="#f8fafc" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
              −
            </text>
            <text x="621" y="236" fill="#22d3ee" fontSize="15" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
              +
            </text>
            <text x="652" y="200" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="600" fontFamily="IBM Plex Mono, monospace">
              U1
            </text>

            {/* Power Rails V_DD and GND on Op-Amp */}
            <line x1="654" y1="164" x2="654" y2="146" stroke="#f59e0b" strokeWidth="1.5" />
            <text x="688" y="156" fill="#f59e0b" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
              +{electronics.vRef.toFixed(1)}V
            </text>
            <line x1="654" y1="226" x2="654" y2="262" stroke="#64748b" strokeWidth="1.5" />
            <line x1="644" y1="262" x2="664" y2="262" stroke="#64748b" strokeWidth="1.8" />
            <text x="676" y="266" fill="#64748b" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
              GND
            </text>

            {/* Input wire to (-) and (+) aligned cleanly with triangle */}
            <line x1="574" y1="164" x2="612" y2="164" stroke="#22d3ee" strokeWidth="2.2" />
            <line x1="574" y1="148" x2="574" y2="164" stroke="#22d3ee" strokeWidth="2.2" />

            {/* Op-Amp Output Wire & Live Voltage Callout */}
            <line x1="712" y1="195" x2="824" y2="195" stroke={isSaturated ? '#f59e0b' : '#22d3ee'} strokeWidth="2.4" />
            <rect
              x="718"
              y="206"
              width="78"
              height="36"
              rx="4"
              fill={isSaturated ? '#451a03' : '#082f49'}
              stroke={isSaturated ? '#f59e0b' : '#22d3ee'}
            />
            <text x="757" y="221" textAnchor="middle" fill="#cbd5e1" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
              V_out
            </text>
            <text
              x="757"
              y="236"
              textAnchor="middle"
              fill={isSaturated ? '#fde68a' : '#22d3ee'}
              fontSize="12"
              fontWeight="700"
              fontFamily="IBM Plex Mono, monospace"
            >
              {ch.opAmpOutV.toFixed(2)} V
            </text>
          </g>

          {/* ================= 5. DEMODULATOR & RC LPF ================= */}
          <g
            onClick={() => setSelectedNode('demod-lpf')}
            className="cursor-pointer"
          >
            <rect
              x="824"
              y="108"
              width="136"
              height="208"
              rx="6"
              fill={selectedNode === 'demod-lpf' ? 'rgba(8, 145, 178, 0.14)' : 'rgba(15, 23, 42, 0.45)'}
              stroke={strokeFor('demod-lpf', '#1e293b')}
              strokeWidth={selectedNode === 'demod-lpf' ? 1.8 : 1}
            />
            <text x="892" y="130" textAnchor="middle" fill="#cbd5e1" fontSize="11.5" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
              Demod &amp; LPF
            </text>

            {/* Mixer / Synchronous Switch Box */}
            <rect x="838" y="176" width="44" height="38" rx="4" fill="#090d16" stroke="#38bdf8" strokeWidth="1.6" />
            <line x1="846" y1="184" x2="874" y2="206" stroke="#38bdf8" strokeWidth="1.6" />
            <line x1="874" y1="184" x2="846" y2="206" stroke="#38bdf8" strokeWidth="1.6" />
            <text x="860" y="166" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
              f_exc
            </text>

            {/* RC LPF */}
            <line x1="882" y1="195" x2="898" y2="195" stroke="#38bdf8" strokeWidth="2" />
            <polyline
              points="898,195 903,189 909,201 915,189 921,201 927,189 932,195"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.6"
            />
            <line x1="932" y1="195" x2="978" y2="195" stroke="#22d3ee" strokeWidth="2.2" />
            <circle cx="940" cy="195" r="3" fill="#22d3ee" />
            <line x1="940" y1="195" x2="940" y2="240" stroke="#94a3b8" strokeWidth="1.6" />
            <line x1="928" y1="240" x2="952" y2="240" stroke="#cbd5e1" strokeWidth="2" />
            <line x1="928" y1="248" x2="952" y2="248" stroke="#cbd5e1" strokeWidth="2" />
            <line x1="940" y1="248" x2="940" y2="278" stroke="#64748b" strokeWidth="1.6" />
            <line x1="930" y1="278" x2="950" y2="278" stroke="#64748b" strokeWidth="2" />
            <line x1="934" y1="283" x2="946" y2="283" stroke="#64748b" strokeWidth="1.6" />

            <text x="892" y="304" textAnchor="middle" fill="#38bdf8" fontSize="11" fontFamily="IBM Plex Mono, monospace">
              V_cond = {ch.conditionedVoltageV.toFixed(2)} V
            </text>
          </g>

          {/* ================= 6. ADC & MCU CENTROID ================= */}
          <g
            onClick={() => setSelectedNode('adc-mcu')}
            className="cursor-pointer"
          >
            <rect
              x="978"
              y="108"
              width="122"
              height="208"
              rx="6"
              fill={selectedNode === 'adc-mcu' ? 'rgba(8, 145, 178, 0.14)' : 'rgba(15, 23, 42, 0.45)'}
              stroke={strokeFor('adc-mcu', '#1e293b')}
              strokeWidth={selectedNode === 'adc-mcu' ? 1.8 : 1}
            />
            <text x="1039" y="130" textAnchor="middle" fill="#cbd5e1" fontSize="11.5" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
              ADC &amp; MCU
            </text>

            {/* ADC Polygon */}
            <polygon
              points="994,170 1084,170 1084,220 994,220 982,195"
              fill="#090d16"
              stroke="#10b981"
              strokeWidth="1.8"
            />
            <text x="1037" y="191" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="600" fontFamily="IBM Plex Mono, monospace">
              {electronics.adcBits}-bit ADC
            </text>
            <text x="1037" y="209" textAnchor="middle" fill="#e2e8f0" fontSize="10.5" fontFamily="IBM Plex Mono, monospace">
              {ch.adcCounts} cnts
            </text>

            {/* Arrow down to MCU Centroid */}
            <line x1="1039" y1="220" x2="1039" y2="246" stroke="#10b981" strokeWidth="1.8" markerEnd="url(#arrowSlate)" />
            <rect x="990" y="248" width="98" height="52" rx="4" fill="#090d16" stroke="#334155" />
            <text x="1039" y="266" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
              CENTROID
            </text>
            <text x="1039" y="286" textAnchor="middle" fill="#22d3ee" fontSize="11.5" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
              {tickOutput.improvedEstimate.positionMm !== null
                ? `${tickOutput.improvedEstimate.positionMm.toFixed(1)} mm`
                : 'NO TOUCH'}
            </text>
          </g>

          {/* Summary Footer Band inside Schematic */}
          <text x="26" y="446" fill="#64748b" fontSize="11" fontFamily="IBM Plex Mono, monospace">
            ACTIVE STAGE GAIN: {ch.opAmpGainVPerPf.toFixed(2)} V/pF  |  SINGLE-SUPPLY RAIL: [0.05 V, {(electronics.vRef - 0.05).toFixed(2)} V]  |  OP-AMP BIAS: {ch.opAmpVirtualGndV.toFixed(2)} V
          </text>
        </svg>
      </div>

      {/* Bottom Grid: Inspected Node Explanation + Editable Circuit Component Values */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Clicked Schematic Stage Breakdown */}
        <div className="space-y-4 rounded-lg border border-slate-800 bg-[#0b111d] p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-100">
                {activeMeta.title}
              </h2>
              <p className="font-mono text-xs text-cyan-300">{activeMeta.subtitle}</p>
            </div>
            {isSaturated && (
              <span className="rounded border border-amber-500/50 bg-amber-950/50 px-2.5 py-1 font-mono text-xs font-semibold text-amber-300">
                OP-AMP RAIL CLIPPING ({ch.opAmpOutV.toFixed(2)} V)
              </span>
            )}
          </div>

          <div className="rounded border border-slate-800 bg-[#070b12] p-3 font-mono text-xs leading-relaxed text-cyan-200 tabular-nums">
            {liveFormulaText}
          </div>

          <div className="grid grid-cols-1 gap-4 text-sm leading-relaxed text-slate-300 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                How It Works
              </h3>
              <p className="mt-1.5 text-[13px]">{activeMeta.whyItMatters}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Engineering Trade-Off
              </h3>
              <p className="mt-1.5 text-[13px]">{activeMeta.designTradeoff}</p>
            </div>
          </div>

          {/* Stage quick navigation pills */}
          <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
            {(Object.keys(NODE_EXPLANATIONS) as CircuitNodeId[]).map((id) => (
              <button
                key={id}
                onClick={() => setSelectedNode(id)}
                className={`rounded border px-2.5 py-1 text-[11px] font-mono transition-colors ${
                  selectedNode === id
                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {NODE_EXPLANATIONS[id].title.split('.')[0]}. {NODE_EXPLANATIONS[id].title.split('. ')[1].split(' (')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Editable Schematic Component Values */}
        <div className="space-y-3.5 rounded-lg border border-slate-800 bg-[#0b111d] p-5 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h2 className="text-sm font-semibold text-slate-200">
              Component Values &amp; Op-Amp Tuning
            </h2>
            <span className="font-mono text-[11px] text-slate-400">
              V_DD = {electronics.vRef.toFixed(1)} V
            </span>
          </div>

          <div>
            <div className="flex justify-between text-xs font-mono text-slate-300">
              <span>Feedback Resistor R_f</span>
              <span className="tabular-nums text-orange-300">
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
            <div className="flex justify-between text-xs font-mono text-slate-300">
              <span>Feedback Capacitor C_f</span>
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
                setElectronics((el) => ({ ...el, feedbackCapPf: Number(e.target.value) }))
              }
              className="mt-1 w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>V_exc (Vpp)</span>
                <span className="tabular-nums text-cyan-300">
                  {electronics.excitationVoltageV.toFixed(1)} V
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
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>f_exc (kHz)</span>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>PGA Multiplier</span>
                <span className="tabular-nums text-cyan-300">
                  {electronics.readoutGain.toFixed(2)}×
                </span>
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

            <div>
              <div className="mb-1 text-xs font-mono text-slate-300">ADC Bits</div>
              <div className="flex gap-1">
                {([10, 12, 14] as const).map((bits) => (
                  <button
                    key={bits}
                    onClick={() => setElectronics((el) => ({ ...el, adcBits: bits }))}
                    className={`flex-1 rounded border py-1 text-xs font-mono ${
                      electronics.adcBits === bits
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {bits}b
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="border-t border-slate-800 pt-2.5 text-[11px] leading-relaxed text-slate-400">
            Experiment: Switch U1 to <strong className="text-slate-200">Charge Integrator</strong> and lower <strong className="text-slate-200">C_f</strong> toward <strong className="text-slate-200">1.5 pF</strong> while touching a pad to watch U1 saturate against the 3.3 V rail.
          </p>
        </div>
      </div>
    </div>
  );
};
