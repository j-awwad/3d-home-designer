import { Injectable } from '@angular/core';
import * as THREE from 'three';

@Injectable({ providedIn: 'root' })
export class SceneService {
  scene = new THREE.Scene();
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;

  init(canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0xf0f0f0);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    this.camera.position.set(0, 5, 18);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(4, 8, 10);

    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  }
}
