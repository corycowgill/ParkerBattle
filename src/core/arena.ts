// Bowl geometry helpers. The arena floor is a parabola of revolution; physics
// stays a flat 2D plane (see Physics.ts) while the *visual* height of a bey is
// looked up from this profile, so beys ride up the bowl wall convincingly.

import { BALANCE } from '../data/balance';

/** Height of the bowl surface at a given distance from the centre. */
export function bowlSurfaceY(radius: number): number {
  const r = Math.min(radius, BALANCE.bowlRadius) / BALANCE.bowlRadius;
  return BALANCE.bowlDepth * r * r;
}

/** Inward slope angle of the bowl wall at a given radius (radians). */
export function bowlSlopeAngle(radius: number): number {
  const R = BALANCE.bowlRadius;
  const r = Math.min(radius, R);
  const slope = (2 * BALANCE.bowlDepth * r) / (R * R);
  return Math.atan(slope);
}
