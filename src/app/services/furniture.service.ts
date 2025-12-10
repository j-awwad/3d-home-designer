// src/app/services/furniture.service.ts
import { Injectable } from '@angular/core';
import { signal } from '@angular/core';
import { FurnitureConfig } from '../models/furniture-config';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

@Injectable({ providedIn: 'root' })
export class FurnitureService {
  items = signal<FurnitureConfig[]>([]);
  private objects = new Map<number, THREE.Object3D>();
  private nextId = 1;
  private loader = new GLTFLoader();

  add(modelUrl: string, name: string, roomId: number | null = null, onLoaded: (obj: THREE.Object3D) => void): void {
    const id = this.nextId++;
    const item: FurnitureConfig = { id, name, modelUrl, roomId, lockedToRoom: false, x: 0, y: 0, z: 0, rotationY: 0, scale: 1 };
    this.items.update(list => [...list, item]);

    this.loader.load(modelUrl, gltf => {
      const obj = gltf.scene;
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = child.receiveShadow = true;
        }
      });
      obj.userData = { isFurniture: true, furnitureId: id };
      obj.position.set(0, 0, 0);
      obj.scale.set(1, 1, 1);
      this.objects.set(id, obj);
      onLoaded(obj);
    });
  }

  updateField(id: number, key: keyof FurnitureConfig, value: any): void {
    this.items.update(list => list.map(f => f.id === id ? { ...f, [key]: value } : f));
  }

  getObject(id: number): THREE.Object3D | undefined {
    return this.objects.get(id);
  }

  getAllObjects(): Map<number, THREE.Object3D> {
    return this.objects;
  }

  setTransform(item: FurnitureConfig, obj: THREE.Object3D): void {
    obj.position.set(item.x, item.y, item.z);
    obj.rotation.y = item.rotationY;
    obj.scale.set(item.scale, item.scale, item.scale);
  }
}