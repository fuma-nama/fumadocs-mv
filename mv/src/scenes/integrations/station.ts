import type * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import type { Route } from './route';
import type { StationDef } from './k';

export interface StationCtx {
  /** global time */
  t: number;
  /** time since the station's downbeat */
  lt: number;
  /** current zoom (to keep hairlines at 1 screen px: lw / s) */
  s: number;
  /** packet position in local px (if inside this station) */
  packet: { x: number; y: number } | null;
  def: StationDef;
  /** fade for far/converging stations */
  alpha: number;
}

export interface StationImpl {
  /** packet route through the station (local px, absolute times) */
  route: Route;
  /** packet leaves the ring at local x `xe` at `tIn`, returns at `xx` at `tOut` */
  xe: number;
  xx: number;
  tIn: number;
  tOut: number;
  /** draw under the 3D layer */
  back?(c: CanvasRenderingContext2D, x: StationCtx): void;
  /** draw over the 3D layer */
  front(c: CanvasRenderingContext2D, x: StationCtx): void;
  /** output card (local px) carried into the core during the converge */
  out: { x: number; y: number; w: number; h: number };
  /** draw just the output card (local px) */
  drawOutput(c: CanvasRenderingContext2D, x: StationCtx): void;
  /** optional 3D layer for this station (m = station-local → screen) */
  three?(g: Gfx, x: StationCtx, m: DOMMatrix): THREE.Texture | null;
  /** packet hidden (e.g. inside the vault) */
  hidePacket?(t: number): boolean;
  /** packet drawn without its comet tail (e.g. riding a render bar) */
  noTail?(t: number): boolean;
}
