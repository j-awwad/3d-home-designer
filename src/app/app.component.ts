import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  HostListener,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { signal, computed } from '@angular/core';

type RoomConfig = {
  id: number;
  name: string;
  width: number;
  depth: number;
  x: number;
  z: number;
  rotationY: number;
};

type FurnitureConfig = {
  id: number;
  name: string;
  modelUrl: string;
  roomId: number | null; // which room it belongs to
  lockedToRoom: boolean; // true = parented to room group
  x: number; // local position inside room (if locked) or world pos (if not)
  y: number;
  z: number;
  rotationY: number; // radians
  scale: number;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  // palette colors
  colors: string[] = [
    '#f44336',
    '#e91e63',
    '#9c27b0',
    '#3f51b5',
    '#2196f3',
    '#009688',
    '#4caf50',
    '#ff9800',
    '#795548',
    '#9e9e9e',
  ];

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private frameId = 0;

  // highlighted plot (ground) mesh
  private plotMesh: THREE.Mesh | null = null;

  // all room meshes/groups
  private roomObjects: THREE.Object3D[] = [];
  private roomGroupsById = new Map<number, THREE.Group>();

  // selection / picking
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private selectableObjects: THREE.Object3D[] = [];
  private selectedObject: THREE.Object3D | null = null;
  private selectionBox: THREE.BoxHelper | null = null;

  private currentDragColor: string | null = null;

  // furniture state
  furnitureItems = signal<FurnitureConfig[]>([]);
  private furnitureObjects = new Map<number, THREE.Object3D>();
  private nextFurnitureId = 1;
  private loader = new GLTFLoader();

  // --- house + rooms config ---
  houseWidth = signal(10);
  houseDepth = signal(10);
  roomCount = signal(1);

  rooms = signal<RoomConfig[]>([]);
  selectedRoomId = signal<number | null>(null);

  selectedRoom = computed(
    () => this.rooms().find((r) => r.id === this.selectedRoomId()) ?? null
  );

  ngAfterViewInit() {
    this.initScene();

    // initial room data and 3D build
    this.buildRoomsFromCount();
    this.buildRooms3DFromConfig();

    this.startLoop();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.frameId);
    this.renderer.dispose();
    this.controls.dispose();
  }

  // ---------- house + rooms config ----------

  buildRoomsFromCount() {
    const count = Math.max(1, this.roomCount() | 0);
    const newRooms: RoomConfig[] = [];

    for (let i = 0; i < count; i++) {
      newRooms.push({
        id: i + 1,
        name: `Room ${i + 1}`,
        width: 6,
        depth: 6,
        x: i * 8, // spread rooms apart initially
        z: 0,
        rotationY: 0,
      });
    }

    this.rooms.set(newRooms);
    this.selectedRoomId.set(newRooms[0]?.id ?? null);

    this.buildRooms3DFromConfig();
  }

  selectRoom(id: number) {
    this.selectedRoomId.set(id);
  }

  updateHouseWidth(value: number) {
    this.houseWidth.set(Math.max(1, value || 0));
  }

  updateHouseDepth(value: number) {
    this.houseDepth.set(Math.max(1, value || 0));
  }

  updateRoomField<K extends keyof RoomConfig>(
    roomId: number,
    key: K,
    value: RoomConfig[K]
  ) {
    const updated = this.rooms().map((r) =>
      r.id === roomId ? { ...r, [key]: value } : r
    );
    this.rooms.set(updated);
  }

  rebuildHouse() {
    this.buildRooms3DFromConfig();
  }

  // ---------- Three.js scene setup ----------

  private initScene() {
    const canvas = this.canvasRef.nativeElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 5, 18);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(width, height);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.target.set(0, 2, 0);

    this.controls.minPolarAngle = Math.PI / 6; // 30°
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 50;

    this.controls.update();

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(4, 8, 10);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  }

  // ---------- Rooms & ground ----------

  private buildRooms3DFromConfig() {
    const wallHeight = 4;

    // 0. PLOT / GROUND
    if (this.plotMesh) {
      this.scene.remove(this.plotMesh);
      this.plotMesh = null;
    }

    const plotGeo = new THREE.PlaneGeometry(
      this.houseWidth(),
      this.houseDepth()
    );
    const plotMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      side: THREE.DoubleSide,
      opacity: 0.35,
      transparent: true,
    });
    this.plotMesh = new THREE.Mesh(plotGeo, plotMat);
    this.plotMesh.rotation.x = -Math.PI / 2;
    this.plotMesh.position.y = 0;
    this.scene.add(this.plotMesh);

    // 1. REMOVE OLD ROOM MESHES
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox = null;
    }

    const toRemove = this.roomObjects;
    const toRemoveSet = new Set(toRemove);

    toRemove.forEach((obj) => this.scene.remove(obj));

    this.selectableObjects = this.selectableObjects.filter(
      (obj) => !toRemoveSet.has(obj)
    );

    if (this.selectedObject && toRemoveSet.has(this.selectedObject)) {
      this.selectedObject = null;
    }

    this.roomObjects = [];
    this.roomGroupsById.clear();

    // 2. CREATE NEW ROOMS
    for (const room of this.rooms()) {
      const group = new THREE.Group();
      group.position.set(room.x, 0, room.z);
      group.rotation.y = room.rotationY;

      group.userData['isRoomGroup'] = true;
      group.userData['roomId'] = room.id;

      this.roomGroupsById.set(room.id, group);

      const floorGeo = new THREE.PlaneGeometry(room.width, room.depth);
      const wallGeoX = new THREE.PlaneGeometry(room.width, wallHeight);
      const wallGeoZ = new THREE.PlaneGeometry(room.depth, wallHeight);

      const floorMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0 });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        side: THREE.BackSide,
      });

      // FLOOR
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      group.add(floor);
      this.selectableObjects.push(floor);
      this.roomObjects.push(floor);

      // BACK WALL (-Z)
      const backWall = new THREE.Mesh(wallGeoX, wallMat.clone());
      backWall.position.set(0, wallHeight / 2, -room.depth / 2);
      group.add(backWall);
      this.selectableObjects.push(backWall);
      this.roomObjects.push(backWall);

      // FRONT WALL (+Z)
      const frontWall = new THREE.Mesh(wallGeoX, wallMat.clone());
      frontWall.position.set(0, wallHeight / 2, room.depth / 2);
      frontWall.rotation.y = Math.PI;
      group.add(frontWall);
      this.selectableObjects.push(frontWall);
      this.roomObjects.push(frontWall);

      // LEFT WALL (-X)
      const leftWall = new THREE.Mesh(wallGeoZ, wallMat.clone());
      leftWall.position.set(-room.width / 2, wallHeight / 2, 0);
      leftWall.rotation.y = Math.PI / 2;
      group.add(leftWall);
      this.selectableObjects.push(leftWall);
      this.roomObjects.push(leftWall);

      // RIGHT WALL (+X)
      const rightWall = new THREE.Mesh(wallGeoZ, wallMat.clone());
      rightWall.position.set(room.width / 2, wallHeight / 2, 0);
      rightWall.rotation.y = -Math.PI / 2;
      group.add(rightWall);
      this.selectableObjects.push(rightWall);
      this.roomObjects.push(rightWall);

      // ROOF
      const roof = new THREE.Mesh(
        new THREE.PlaneGeometry(room.width, room.depth),
        roofMat
      );
      roof.rotation.x = Math.PI / 2;
      roof.position.y = wallHeight;
      group.add(roof);
      this.selectableObjects.push(roof);
      this.roomObjects.push(roof);

      this.scene.add(group);
      this.roomObjects.push(group);
    }

    // 3. RE-ATTACH FURNITURE
    for (const item of this.furnitureItems()) {
      const obj = this.furnitureObjects.get(item.id);
      if (!obj) continue;
      this.attachFurnitureObject(item, obj);
    }
  }

  // ---------- furniture ----------

  addFurniture(modelUrl: string, name: string, roomId: number | null = null) {
    const id = this.nextFurnitureId++;
    const item: FurnitureConfig = {
      id,
      name,
      modelUrl,
      roomId,
      lockedToRoom: false,
      x: 0,
      y: 0,
      z: 0,
      rotationY: 0,
      scale: 1,
    };

    this.furnitureItems.update((list) => [...list, item]);

    this.loader.load(modelUrl, (gltf) => {
      const obj = gltf.scene;
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      obj.userData['isFurniture'] = true;
      obj.userData['furnitureId'] = id;

      obj.position.set(0, 0, 0);
      obj.scale.set(item.scale, item.scale, item.scale);
      obj.rotation.y = item.rotationY;

      this.scene.add(obj);
      this.selectableObjects.push(obj);
      this.furnitureObjects.set(id, obj);
    });
  }

  lockFurnitureToSelectedRoom() {
    if (!this.selectedObject) return;

    const furnitureId = this.selectedObject.userData?.['furnitureId'] as
      | number
      | undefined;
    if (!furnitureId) return;

    const room = this.selectedRoom();
    if (!room) return;

    this.furnitureItems.update((list) =>
      list.map((f) =>
        f.id === furnitureId ? { ...f, lockedToRoom: true, roomId: room.id } : f
      )
    );

    const obj = this.furnitureObjects.get(furnitureId);
    if (!obj) return;

    const roomGroup = this.roomGroupsById.get(room.id);
    if (!roomGroup) return;

    obj.updateMatrixWorld();
    const worldPos = new THREE.Vector3();
    worldPos.setFromMatrixPosition(obj.matrixWorld);
    roomGroup.worldToLocal(worldPos);

    this.furnitureItems.update((list) =>
      list.map((f) =>
        f.id === furnitureId
          ? { ...f, x: worldPos.x, y: worldPos.y, z: worldPos.z }
          : f
      )
    );

    const updated = this.furnitureItems().find((f) => f.id === furnitureId)!;
    this.attachFurnitureObject(updated, obj);
  }

  unlockFurniture() {
    if (!this.selectedObject) return;

    const furnitureId = this.selectedObject.userData?.['furnitureId'] as
      | number
      | undefined;
    if (!furnitureId) return;

    const obj = this.furnitureObjects.get(furnitureId);
    if (!obj) return;

    obj.updateMatrixWorld();
    const worldPos = new THREE.Vector3();
    worldPos.setFromMatrixPosition(obj.matrixWorld);

    this.furnitureItems.update((list) =>
      list.map((f) =>
        f.id === furnitureId
          ? {
              ...f,
              lockedToRoom: false,
              roomId: null,
              x: worldPos.x,
              y: worldPos.y,
              z: worldPos.z,
            }
          : f
      )
    );

    this.scene.attach(obj);
  }

  private attachFurnitureObject(item: FurnitureConfig, obj: THREE.Object3D) {
    if (item.lockedToRoom && item.roomId != null) {
      const roomGroup = this.roomGroupsById.get(item.roomId);
      if (!roomGroup) return;

      this.scene.attach(obj);
      roomGroup.add(obj);
      obj.position.set(item.x, item.y, item.z);
    } else {
      this.scene.add(obj);
      obj.position.set(item.x, item.y, item.z);
    }
    obj.rotation.y = item.rotationY;
    obj.scale.set(item.scale, item.scale, item.scale);
  }

  private startLoop = () => {
    this.frameId = requestAnimationFrame(this.startLoop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  // ---------- color helpers ----------

  private applyColorToObject(target: THREE.Object3D, color: string | number) {
    target.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.color.set(color);
        }
      }
    });
  }

  private findSelectableRoot(obj: THREE.Object3D): THREE.Object3D {
    let current: THREE.Object3D | null = obj;
    while (current) {
      if (this.selectableObjects.includes(current)) {
        return current;
      }
      current = current.parent;
    }
    return obj;
  }

  private findRoomGroup(obj: THREE.Object3D): THREE.Object3D | null {
    let current: THREE.Object3D | null = obj;
    while (current) {
      if (current.userData && current.userData['isRoomGroup']) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  // ---------- palette actions ----------

  onSwatchClick(color: string) {
    if (!this.selectedObject) return;
    this.applyColorToObject(this.selectedObject, color);
  }

  randomizeSelectedColor() {
    if (!this.selectedObject) return;
    const randomColor =
      '#' +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0');
    this.applyColorToObject(this.selectedObject, randomColor);
  }

  // ---------- selection with click ----------

  onCanvasClick(event: MouseEvent) {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      this.selectableObjects,
      true
    );

    if (intersects.length > 0) {
      const hitObject = intersects[0].object;
      this.selectedObject = this.findSelectableRoot(hitObject);
      this.updateSelectionHighlight();
    }
  }

  // ---------- drag & drop from palette ----------

  onColorDragStart(event: DragEvent, color: string) {
    this.currentDragColor = color;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', color);
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onCanvasDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onCanvasDrop(event: DragEvent) {
    event.preventDefault();

    const colorFromState = this.currentDragColor;
    const colorFromEvent = event.dataTransfer?.getData('text/plain') || null;
    const color = colorFromState || colorFromEvent;
    if (!color) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      this.selectableObjects,
      true
    );

    if (intersects.length > 0) {
      const hitObject = intersects[0].object;
      this.selectedObject = this.findSelectableRoot(hitObject);
      this.applyColorToObject(this.selectedObject, color);
      this.updateSelectionHighlight();
    }

    this.currentDragColor = null;
  }

  private updateSelectionHighlight() {
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox = null;
    }

    if (!this.selectedObject) return;

    this.selectionBox = new THREE.BoxHelper(this.selectedObject, 0xffff00);
    this.scene.add(this.selectionBox);
  }

  // ---------- movement / transform helpers ----------

  moveSelectedRoom(dx: number, dz: number) {
    if (!this.selectedObject) return;

    const roomGroup = this.findRoomGroup(this.selectedObject);
    if (!roomGroup) return;

    const roomId = roomGroup.userData?.['roomId'] as number | undefined;
    if (roomId == null) return;

    const room = this.rooms().find((r) => r.id === roomId);
    if (!room) return;

    let newX = roomGroup.position.x + dx;
    let newZ = roomGroup.position.z + dz;

    const halfPlotW = this.houseWidth() / 2;
    const halfPlotD = this.houseDepth() / 2;
    const halfRoomW = room.width / 2;
    const halfRoomD = room.depth / 2;

    newX = Math.min(
      halfPlotW - halfRoomW,
      Math.max(-halfPlotW + halfRoomW, newX)
    );
    newZ = Math.min(
      halfPlotD - halfRoomD,
      Math.max(-halfPlotD + halfRoomD, newZ)
    );

    roomGroup.position.set(newX, 0, newZ);
    this.updateRoomField(roomId, 'x', newX);
    this.updateRoomField(roomId, 'z', newZ);
    this.updateSelectionHighlight();
  }

  moveSelectedFurniture(dx: number, dz: number) {
    if (!this.selectedObject) return;

    const furnitureId = this.selectedObject.userData?.['furnitureId'] as
      | number
      | undefined;
    if (!furnitureId) return;

    const item = this.furnitureItems().find((f) => f.id === furnitureId);
    if (!item) return;

    const obj = this.furnitureObjects.get(furnitureId);
    if (!obj) return;

    if (item.lockedToRoom && obj.parent) {
      obj.position.x += dx;
      obj.position.z += dz;

      this.furnitureItems.update((list) =>
        list.map((f) =>
          f.id === furnitureId
            ? { ...f, x: obj.position.x, z: obj.position.z }
            : f
        )
      );
    } else {
      obj.position.x += dx;
      obj.position.z += dz;

      this.furnitureItems.update((list) =>
        list.map((f) =>
          f.id === furnitureId
            ? { ...f, x: obj.position.x, z: obj.position.z }
            : f
        )
      );
    }

    this.updateSelectionHighlight();
  }

  // lift / lower furniture
  adjustSelectedFurnitureHeight(dy: number) {
    if (!this.selectedObject) return;

    const furnitureId = this.selectedObject.userData?.['furnitureId'] as
      | number
      | undefined;
    if (!furnitureId) return;

    const item = this.furnitureItems().find((f) => f.id === furnitureId);
    if (!item) return;

    const obj = this.furnitureObjects.get(furnitureId);
    if (!obj) return;

    obj.position.y += dy;

    this.furnitureItems.update((list) =>
      list.map((f) => (f.id === furnitureId ? { ...f, y: obj.position.y } : f))
    );

    this.updateSelectionHighlight();
  }

  // scale furniture (uniform)
  scaleSelectedFurniture(factor: number) {
    if (!this.selectedObject) return;

    const furnitureId = this.selectedObject.userData?.['furnitureId'] as
      | number
      | undefined;
    if (!furnitureId) return;

    const item = this.furnitureItems().find((f) => f.id === furnitureId);
    if (!item) return;

    const obj = this.furnitureObjects.get(furnitureId);
    if (!obj) return;

    const newScale = Math.max(0.1, item.scale * factor);

    obj.scale.set(newScale, newScale, newScale);

    this.furnitureItems.update((list) =>
      list.map((f) => (f.id === furnitureId ? { ...f, scale: newScale } : f))
    );

    this.updateSelectionHighlight();
  }

  // rotate furniture around Y (degrees)
  rotateSelectedFurniture(deltaDegrees: number) {
    if (!this.selectedObject) return;

    const furnitureId = this.selectedObject.userData?.['furnitureId'] as
      | number
      | undefined;
    if (!furnitureId) return;

    const item = this.furnitureItems().find((f) => f.id === furnitureId);
    if (!item) return;

    const obj = this.furnitureObjects.get(furnitureId);
    if (!obj) return;

    const deltaRad = (deltaDegrees * Math.PI) / 180;
    const newRot = item.rotationY + deltaRad;

    obj.rotation.y = newRot;

    this.furnitureItems.update((list) =>
      list.map((f) => (f.id === furnitureId ? { ...f, rotationY: newRot } : f))
    );

    this.updateSelectionHighlight();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    const step = 0.5;

    const isFurniture = this.selectedObject?.userData?.['furnitureId'] != null;
    const isRoom =
      this.findRoomGroup(this.selectedObject ?? new THREE.Object3D()) != null;

    if (isFurniture) {
      switch (event.key) {
        case 'a':
        case 'A':
          this.moveSelectedFurniture(-step, 0);
          break;
        case 'd':
        case 'D':
          this.moveSelectedFurniture(step, 0);
          break;
        case 'w':
        case 'W':
          this.moveSelectedFurniture(0, -step);
          break;
        case 's':
        case 'S':
          this.moveSelectedFurniture(0, step);
          break;
        case 'q':
        case 'Q':
          this.adjustSelectedFurnitureHeight(0.1);
          break;
        case 'e':
        case 'E':
          this.adjustSelectedFurnitureHeight(-0.1);
          break;
      }
    } else if (isRoom) {
      switch (event.key) {
        case 'ArrowLeft':
          this.moveSelectedRoom(-step, 0);
          break;
        case 'ArrowRight':
          this.moveSelectedRoom(step, 0);
          break;
        case 'ArrowUp':
          this.moveSelectedRoom(0, -step);
          break;
        case 'ArrowDown':
          this.moveSelectedRoom(0, step);
          break;
      }
    }
  }
}
