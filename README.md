# CapSense Lab — Interactive 3D Capacitive Touch Slider Simulator

An interactive 3D engineering laboratory built with **React**, **TypeScript**, **Three.js / React Three Fiber / Drei**, and **Recharts** to teach the physical construction, electrostatic sensing principle, readout electronics, non-idealities, and weighted-centroid position estimation of a 3-electrode and 6-electrode capacitive touch slider.

## Setup & Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

To run TypeScript checks and production build:

```bash
npm run lint
npm run build
```

## Architecture

All eight laboratory modules share a single synchronized state and physics engine (`src/simulation/sensorEngine.ts` and `src/simulation/SimulationContext.tsx`):

1. **3D Sensor** (`Sensor3DView` + `TouchSliderScene`): Interactive PCB assembly (enclosure, ground shield, FR-4 core, 3 or 6 copper electrodes + sense bus traces + Op-Amp AFE IC `U1` with SMD `Rf || Cf` & live `D1` output LED + 8-pin header, protective dielectric overlay, articulated finger). Supports direct pointer dragging along the PCB track, live Op-Amp readout telemetry and tuning, hover/touch/hold/sweep/double-finger modes, exploded view, cross-section clipping plane, and conceptual fringing electric field lines.
2. **Working Principle** (`WorkingPrincipleView`): Interactive cross-section diagram and real-time spatial sensitivity profile $S_i(x)$ curves.
3. **Electronics** (`ElectronicsView`): Interactive 7-stage signal chain (Excitation → Sensor Electrode → Op-Amp Readout → Analog Conditioning → ADC → MCU → Centroid Estimator) with live waveforms and stage inspector.
4. **Circuit Diagram** (`CircuitDiagramView`): Interactive electrical schematic diagram showing AC excitation, capacitive pad equivalent ($C_0, C_{par}, \Delta C, C_{couple}$), mid-rail virtual ground ($V_{bias}$), selectable Op-Amp `U1` topology (TIA $R_f \parallel C_f$ or Switched-Cap Charge Integrator), demodulator/LPF, and ADC/MCU stages with live node voltages and clickable explanations.
5. **Signal Laboratory** (`SignalLabView`): Independent toggles and sliders for channel noise, adjacent-electrode coupling, unequal parasitic capacitances, and baseline drift, with side-by-side clean vs. distorted plots.
6. **Algorithm Laboratory** (`AlgorithmLabView`): Step-by-step algebraic breakdown of baseline subtraction, coupling deconvolution, noise thresholding, EMA / moving-average filtering, weighted centroid, and synchronized 3-vs-6 electrode comparison.
7. **Experiments** (`ExperimentsView`): 9 guided lessons and interactive presets (A–G, hover, double-finger) wired directly into the live 3D engine.
8. **Performance** (`PerformanceView`): Before-vs-after improvement KPIs (MAE, Max Error, False Touches, Missed Touches, Stability $\sigma$), real-time charts, trace replay, and CSV export.

## Mathematical Model

### 1. Spatial Sensitivity Profile
For electrode $i$ spanning $[a_i, b_i]$ along the active slider track $[0, L]$, the spatial coupling sensitivity at finger position $x$ is modeled via the normalized integral of a Gaussian charge distribution with effective field spread $\sigma_{\text{eff}} = \sqrt{r_{\text{finger}}^2 + 0.65 (d_{\text{ov}} + h)^2}$:

$$S_i(x) = \frac{1}{2 S_{\text{norm}}} \left[\operatorname{erf}\left(\frac{b_i - x}{\sqrt{2}\sigma_{\text{eff}}}\right) - \operatorname{erf}\left(\frac{a_i - x}{\sqrt{2}\sigma_{\text{eff}}}\right)\right]$$

### 2. Dielectric Coupling & Hover Attenuation
The peak finger-induced capacitance change scales inversely with equivalent series dielectric thickness (overlay thickness $d_{\text{ov}}$ divided by relative permittivity $\varepsilon_r$, plus air gap height $h$):

$$\Delta C_{\text{peak}} \propto \left(\frac{d_{\text{ref}}}{d_{\text{ov}} / \varepsilon_r + h}\right)^{0.92}$$

### 3. Non-Idealities (Deterministic when Noise = 0)
- **Adjacent Coupling**: $\Delta C_{\text{coupled},i} = (1 - w_i)\Delta C_i + \frac{\alpha}{2}(\Delta C_{i-1} + \Delta C_{i+1})$
- **Unequal Parasitics**: Deterministic per-channel baseline offset $C_{p,i}$
- **Baseline Drift**: Low-frequency thermal/humidity drift $D_i(t)$
- **Channel Noise**: Seeded Gaussian noise $\eta_i(t)$ (zero when disabled)

### 4. Weighted-Centroid Estimator
Given non-negative, baseline-subtracted, optionally deconvolved and filtered weights $w_i = \max(0, y_i - T_{\text{floor}})$:

$$\hat{x} = \frac{\sum_{i=0}^{N-1} x_i \cdot w_i}{\sum_{i=0}^{N-1} w_i}, \quad \text{touch detected if } \sum_{i=0}^{N-1} w_i \ge T_{\text{touch}}$$

## Engineering Assumptions & Limitations

- **Conceptual E-Field Lines**: The 3D electric field lines are analytical Bezier illustrations showing conceptual fringing and finger coupling; they are **not** a 3D Finite Element Method (FEM) electrostatic field solution.
- **Lumped Electronics Model**: The excitation, charge-transfer/TIA readout, analog conditioning, and ADC stages use lumped mathematical transfer equations rather than a SPICE-validated transistor/op-amp netlist.
- **Illustrative Dimensions**: Default PCB dimensions (`90 × 18 mm`, `1.0 mm` overlay, `12.0 pF` baseline) are illustrative engineering parameters until calibrated to a physical PCB stackup and touch controller IC.
- **1D Multi-Touch Limitation**: As demonstrated in Double-Finger mode, a 1D self-capacitance slider collapses two simultaneous contacts into a single weighted average midpoint.
