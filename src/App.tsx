import React from 'react';
import { SimulationProvider, useSimulation } from './simulation/SimulationContext';
import { TopBar } from './components/TopBar';
import { Sensor3DView } from './components/views/Sensor3DView';
import { WorkingPrincipleView } from './components/views/WorkingPrincipleView';
import { ElectronicsView } from './components/views/ElectronicsView';
import { CircuitDiagramView } from './components/views/CircuitDiagramView';
import { SignalLabView } from './components/views/SignalLabView';
import { AlgorithmLabView } from './components/views/AlgorithmLabView';
import { ExperimentsView } from './components/views/ExperimentsView';
import { PerformanceView } from './components/views/PerformanceView';

const MainContent: React.FC = () => {
  const { activeSection } = useSimulation();

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 lab-grid-bg">
      <TopBar />
      <main>
        {activeSection === 'sensor-3d' && <Sensor3DView />}
        {activeSection === 'working-principle' && <WorkingPrincipleView />}
        {activeSection === 'electronics' && <ElectronicsView />}
        {activeSection === 'circuit-diagram' && <CircuitDiagramView />}
        {activeSection === 'signal-lab' && <SignalLabView />}
        {activeSection === 'algorithm-lab' && <AlgorithmLabView />}
        {activeSection === 'experiments' && <ExperimentsView />}
        {activeSection === 'performance' && <PerformanceView />}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <SimulationProvider>
      <MainContent />
    </SimulationProvider>
  );
}
