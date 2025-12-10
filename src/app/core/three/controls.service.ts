import { Injectable } from '@angular/core';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SceneService } from './scene.service';

@Injectable({ providedIn: 'root' })
export class ControlsService {
  controls!: OrbitControls;

  constructor(private scene: SceneService) {}

  init(canvas: HTMLCanvasElement) {
    this.controls = new OrbitControls(this.scene.camera, canvas);

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.controls.minPolarAngle = Math.PI / 6;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.target.set(0, 2, 0);
  }

  tick() {
    this.controls.update();
  }
}
