export type MotionState = { x: number; y: number; vx: number; vy: number };
export type Rectangle = { x: number; y: number; width: number; height: number };
export function advanceMotion(state: MotionState, area: Rectangle, hitbox: Rectangle, seconds: number): MotionState & { hitX: boolean; hitY: boolean };
export function floorY(area: Rectangle, hitbox: Rectangle): number;
export function advanceGroundMotion(state: MotionState, area: Rectangle, hitbox: Rectangle, seconds: number): MotionState & { hitX: boolean; hitY: boolean };
export function advanceFall(state: { x: number; y: number; vy: number }, area: Rectangle, hitbox: Rectangle, seconds: number, gravity?: number): { x: number; y: number; vy: number; landed: boolean };
