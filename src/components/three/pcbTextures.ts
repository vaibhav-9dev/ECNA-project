import * as THREE from 'three';
import { ElectrodeCount } from '../../simulation/types';
import { computeElectrodeLayout } from '../../simulation/sensorEngine';

/**
 * Generates a high-DPI procedural PCB top silkscreen & solder-mask texture
 * with millimeter ruler ticks, electrode labels (E1..En), and pinout markings.
 */
export function createPcbSilkscreenTexture(
  sliderLengthMm: number,
  electrodeCount: ElectrodeCount,
  gapMm: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Deep matte solder-mask navy-emerald substrate base
  ctx.fillStyle = '#0d2229';
  ctx.fillRect(0, 0, width, height);

  // Subtle woven fiberglass micro-texture
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Board perimeter outline silkscreen
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, width - 36, height - 36);

  // Active slider region mapping (leave margins left/right on PCB)
  const padLeft = 86;
  const padRight = 86;
  const activePx = width - padLeft - padRight;
  const mmToPx = activePx / sliderLengthMm;

  // Guard ring silkscreen outline around electrode area
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(padLeft - 12, 130, activePx + 24, 240);

  // Bottom millimeter scale ticks
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#94a3b8';
  ctx.font = '600 18px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';

  const stepMm = sliderLengthMm <= 70 ? 5 : 10;
  for (let mm = 0; mm <= sliderLengthMm + 0.01; mm += stepMm / 2) {
    const px = padLeft + mm * mmToPx;
    const isMajor = Math.abs(mm % stepMm) < 0.01;
    ctx.lineWidth = isMajor ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(px, height - 66);
    ctx.lineTo(px, height - (isMajor ? 88 : 78));
    ctx.stroke();
    if (isMajor) {
      ctx.fillText(`${Math.round(mm)}`, px, height - 38);
    }
  }

  ctx.textAlign = 'left';
  ctx.font = '500 15px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('ACTIVE TRACK (mm)', padLeft, height - 96);

  // Electrode labels above active area
  const layout = computeElectrodeLayout(electrodeCount, sliderLengthMm, gapMm);
  ctx.textAlign = 'center';
  ctx.font = '700 22px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#e2e8f0';
  for (const el of layout) {
    const cx = padLeft + el.centerMm * mmToPx;
    ctx.fillText(el.label, cx, 114);
  }

  // Board identifier silkscreen
  ctx.textAlign = 'left';
  ctx.font = '600 18px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`CAP-SLIDER-${electrodeCount}CH REV B`, 38, 56);

  ctx.textAlign = 'right';
  ctx.font = '500 15px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('ILLUSTRATIVE GEOMETRY', width - 38, 56);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a hatched copper ground-plane pattern texture.
 */
export function createGroundHatchTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5c341d';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#c8753e';
  ctx.lineWidth = 4;
  for (let i = -size; i < size * 2; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i + size, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}
