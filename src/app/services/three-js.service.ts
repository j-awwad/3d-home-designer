// src/app/services/three-js.service.ts
import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomConfig } from '../models/room-config';
import { FurnitureConfig } from '../models/furniture-config';

@Injectable({ providedIn: 'root' })
export class ThreeJsService {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private frameId?: number;

  private plotMesh: THREE.Mesh | null = null;
  private roomObjects: THREE.Object3D[] = [];
  private roomGroups = new Map<number, THREE.Group>();

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private selectable: THREE.Object3D[] = [];
  private selected: THREE.Object3D | null = null;
  private selectionBox: THREE.BoxHelper | null = null;

  init(canvas: HTMLCanvasElement): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    this.camera.position.set(0, 5, 18);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 2, 0);
    this.controls.minPolarAngle = Math.PI / 6;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 50;

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(4, 8, 10);
    this.scene.add(light, new THREE.AmbientLight(0xffffff, 0.5));
  }

  startRenderLoop(): void {
    const animate = () => {
      this.frameId = requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  stopRenderLoop(): void {
    if (this.frameId !== undefined) {
      cancelAnimationFrame(this.frameId);
    }
  }

  dispose(): void {
    this.renderer.dispose();
    this.controls.dispose();
  }

  buildPlot(width: number, depth: number): void {
    if (this.plotMesh) {
      this.scene.remove(this.plotMesh);
    }
    const geo = new THREE.PlaneGeometry(width, depth);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      side: THREE.DoubleSide,
      opacity: 0.35,
      transparent: true,
    });
    this.plotMesh = new THREE.Mesh(geo, mat);
    this.plotMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.plotMesh);
  }
  buildRooms(rooms: RoomConfig[]): void {
    // 1) Remove old room objects from scene AND from selectable
    const oldRoomObjects = [...this.roomObjects];

    oldRoomObjects.forEach((obj) => {
      this.scene.remove(obj);
      const idx = this.selectable.indexOf(obj);
      if (idx >= 0) {
        this.selectable.splice(idx, 1);
      }
    });

    this.roomObjects = [];
    this.roomGroups.clear();

    // 2) Reset selection
    this.selected = null;
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox = null;
    }

    // 3) Rebuild rooms
    const height = 4;

    rooms.forEach((room) => {
      const group = new THREE.Group();
      group.position.set(room.x, 0, room.z);
      group.rotation.y = room.rotationY;
      group.userData = { isRoomGroup: true, roomId: room.id };
      this.roomGroups.set(room.id, group);

      const floorGeo = new THREE.PlaneGeometry(room.width, room.depth);
      const wallGeoX = new THREE.PlaneGeometry(room.width, height);
      const wallGeoZ = new THREE.PlaneGeometry(room.depth, height);

      const floorMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0 });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        side: THREE.BackSide,
      });

      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      group.add(floor);

      const back = new THREE.Mesh(wallGeoX, wallMat.clone());
      back.position.set(0, height / 2, -room.depth / 2);
      group.add(back);

      const front = new THREE.Mesh(wallGeoX, wallMat.clone());
      front.position.set(0, height / 2, room.depth / 2);
      front.rotation.y = Math.PI;
      group.add(front);

      const left = new THREE.Mesh(wallGeoZ, wallMat.clone());
      left.position.set(-room.width / 2, height / 2, 0);
      left.rotation.y = Math.PI / 2;
      group.add(left);

      const right = new THREE.Mesh(wallGeoZ, wallMat.clone());
      right.position.set(room.width / 2, height / 2, 0);
      right.rotation.y = -Math.PI / 2;
      group.add(right);

      const roof = new THREE.Mesh(floorGeo, roofMat);
      roof.rotation.x = Math.PI / 2;
      roof.position.y = height;
      group.add(roof);

      // Make room *group* selectable too (not just meshes)
      this.selectable.push(group);

      // Also keep meshes selectable for precise picking if needed
      [floor, back, front, left, right, roof].forEach((mesh) => {
        this.selectable.push(mesh);
        this.roomObjects.push(mesh);
      });

      this.scene.add(group);
      this.roomObjects.push(group);
    });
  }

  reattachFurniture(
    items: FurnitureConfig[],
    objects: Map<number, THREE.Object3D>
  ): void {
    items.forEach((item) => {
      const obj = objects.get(item.id);
      if (obj) {
        if (obj.parent) {
          obj.parent.remove(obj);
        }
        const group =
          item.roomId != null ? this.roomGroups.get(item.roomId) : undefined;
        if (item.lockedToRoom && group) {
          group.add(obj);
        } else {
          this.scene.add(obj);
        }
        obj.position.set(item.x, item.y, item.z);
        obj.rotation.y = item.rotationY;
        obj.scale.set(item.scale, item.scale, item.scale);
      }
    });
  }

  reparent(obj: THREE.Object3D, group?: THREE.Group): void {
    if (obj.parent) {
      obj.parent.remove(obj);
    }
    if (group) {
      group.add(obj);
    } else {
      this.scene.add(obj);
    }
  }

  addObject(obj: THREE.Object3D): void {
    this.scene.add(obj);
    this.selectable.push(obj);
  }

  getSelected(): THREE.Object3D | null {
    return this.selected;
  }

  applyColor(obj: THREE.Object3D | null, color: string | number): void {
    if (!obj) return;

    // Try to detect if object is furniture
    if (obj.userData['isFurniture']) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshStandardMaterial).color.set(color);
        }
      });
      return;
    }

    // Otherwise it's a room mesh → get whole room group
    const roomGroup = this.findRoomGroup(obj);
    if (!roomGroup) return;

    roomGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.MeshStandardMaterial).color.set(color);
      }
    });
  }
  handleClick(event: MouseEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.selectable, true);

    if (intersects.length) {
      const hitRoot = this.findRoot(intersects[0].object);

      const roomGroup = this.findRoomGroup(hitRoot);
      this.selected = roomGroup ? roomGroup : hitRoot;

      this.updateHighlight();
    }
  }

  handleDrop(
    event: DragEvent,
    canvas: HTMLCanvasElement,
    color: string | null
  ): void {
    if (!color) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.selectable, true);
    if (intersects.length) {
      this.selected = this.findRoot(intersects[0].object);
      this.applyColor(this.selected, color);
      this.updateHighlight();
    }
  }

  findRoomGroup(obj: THREE.Object3D): THREE.Group | null {
    let cur = obj;
    while (cur) {
      if (cur.userData['isRoomGroup']) return cur as THREE.Group;
      cur = cur.parent!;
    }
    return null;
  }

  getRoomGroup(id: number): THREE.Group | undefined {
    return this.roomGroups.get(id);
  }

  private findRoot(obj: THREE.Object3D): THREE.Object3D {
    let cur = obj;
    while (cur && !this.selectable.includes(cur)) cur = cur.parent!;
    return cur || obj;
  }

  updateHighlight(): void {
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox = null;
    }
    if (this.selected) {
      this.selectionBox = new THREE.BoxHelper(this.selected, 0xffff00);
      this.scene.add(this.selectionBox);
    }
  }
}
