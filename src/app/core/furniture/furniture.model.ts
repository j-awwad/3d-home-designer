export interface FurnitureConfig {
  id: number;
  name: string;
  modelUrl: string;

  roomId: number | null;
  lockedToRoom: boolean;

  x: number;
  y: number;
  z: number;

  rotationY: number;
  scale: number;
}
