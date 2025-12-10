import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FurnitureConfig } from './furniture.model';
import { SceneService } from '../three/scene.service';
import { RoomService } from '../rooms/room.service';

@Injectable({ providedIn: 'root' })
export class FurnitureService {
  private loader = new GLTFLoader();
  furniture: FurnitureConfig[] = [];
  objects = new Map<number, THREE.Object3D>();
  nextId = 1;

  constructor(private scene: SceneService, private rooms: RoomService) {}

  add(modelUrl: string, name: string) {
    const id = this.nextId++;
    const config: FurnitureConfig = {
      id,
      name,
      modelUrl,
      roomId: null,
      lockedToRoom: false,
      x: 0,
      y: 0,
      z: 0,
      rotationY: 0,
      scale: 1,
    };

    this.furniture.push(config);

    this.loader.load(modelUrl, (gltf) => {
      const obj = gltf.scene;
      obj.userData['isFurniture'] = true;
      obj.userData['furnitureId'] = id;

      obj.position.set(0, 0, 0);
      obj.scale.set(1, 1, 1);

      this.scene.scene.add(obj);
      this.objects.set(id, obj);
    });
  }

  move(id: number, dx: number, dz: number) {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.position.x += dx;
    obj.position.z += dz;
  }

  moveY(id: number, dy: number) {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.position.y += dy;
  }

  scale(id: number, factor: number) {
    const obj = this.objects.get(id);
    if (!obj) return;

    const newScale = Math.max(0.1, obj.scale.x * factor);
    obj.scale.set(newScale, newScale, newScale);
  }

  rotate(id: number, deg: number) {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.rotation.y += (deg * Math.PI) / 180;
  }
}
