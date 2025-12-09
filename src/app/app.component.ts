import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
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

  // all room groups
  private roomObjects: THREE.Object3D[] = [];

  // sofa model
  private sofa!: THREE.Object3D;

  // selection / picking
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private selectableObjects: THREE.Object3D[] = [];
  private selectedObject: THREE.Object3D | null = null;
  private currentDragColor: string | null = null;

  private selectionBox: THREE.BoxHelper | null = null;

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

    this.loadSofa();
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
        x: i * 8, // spread rooms apart for visibility
        z: 0,
        rotationY: 0,
      });
    }

    this.rooms.set(newRooms);
    this.selectedRoomId.set(newRooms[0]?.id ?? null);
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

  // called by "Apply size / rebuild house" button
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
    this.controls.update();

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(4, 8, 10);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  }

  // build one 3D room per RoomConfig
  private buildRooms3DFromConfig() {
    const wallHeight = 4;

    // 1. remove old room meshes
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox = null;
    }

    const toRemove = this.roomObjects;
    const toRemoveSet = new Set(toRemove);

    toRemove.forEach((obj) => this.scene.remove(obj));

    // remove all room meshes from selectableObjects
    this.selectableObjects = this.selectableObjects.filter(
      (obj) => !toRemoveSet.has(obj)
    );

    if (this.selectedObject && toRemoveSet.has(this.selectedObject)) {
      this.selectedObject = null;
    }

    this.roomObjects = [];

    // 2. create new rooms
    for (const room of this.rooms()) {
      const group = new THREE.Group();
      group.position.set(room.x, 0, room.z);
      group.rotation.y = room.rotationY;

      const floorGeo = new THREE.PlaneGeometry(room.width, room.depth);
      const wallGeoX = new THREE.PlaneGeometry(room.width, wallHeight);
      const wallGeoZ = new THREE.PlaneGeometry(room.depth, wallHeight);

      const floorMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0 });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        side: THREE.BackSide,
      });

      // Floor
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      group.add(floor);
      this.selectableObjects.push(floor);
      this.roomObjects.push(floor); // 👈 IMPORTANT

      // Back wall (-Z)
      const backWall = new THREE.Mesh(wallGeoX, wallMat.clone());
      backWall.position.set(0, wallHeight / 2, -room.depth / 2);
      group.add(backWall);
      this.selectableObjects.push(backWall);
      this.roomObjects.push(backWall); // 👈

      // Front wall (+Z)
      const frontWall = new THREE.Mesh(wallGeoX, wallMat.clone());
      frontWall.position.set(0, wallHeight / 2, room.depth / 2);
      frontWall.rotation.y = Math.PI;
      group.add(frontWall);
      this.selectableObjects.push(frontWall);
      this.roomObjects.push(frontWall); // 👈

      // Left wall (-X)
      const leftWall = new THREE.Mesh(wallGeoZ, wallMat.clone());
      leftWall.position.set(-room.width / 2, wallHeight / 2, 0);
      leftWall.rotation.y = Math.PI / 2;
      group.add(leftWall);
      this.selectableObjects.push(leftWall);
      this.roomObjects.push(leftWall); // 👈

      // Right wall (+X)
      const rightWall = new THREE.Mesh(wallGeoZ, wallMat.clone());
      rightWall.position.set(room.width / 2, wallHeight / 2, 0);
      rightWall.rotation.y = -Math.PI / 2;
      group.add(rightWall);
      this.selectableObjects.push(rightWall);
      this.roomObjects.push(rightWall); // 👈

      // Roof
      const roof = new THREE.Mesh(
        new THREE.PlaneGeometry(room.width, room.depth),
        roofMat
      );
      roof.rotation.x = Math.PI / 2;
      roof.position.y = wallHeight;
      group.add(roof);
      this.selectableObjects.push(roof);
      this.roomObjects.push(roof); // 👈

      this.scene.add(group);
      // (optional) this.roomObjects.push(group); // only if you also want to track the group
    }
  }

  private loadSofa() {
    const loader = new GLTFLoader();

    loader.load('/sofa.glb', (gltf) => {
      this.sofa = gltf.scene;
      this.sofa.position.set(0, 1, 0);
      this.sofa.scale.set(1, 1, 1);
      this.sofa.rotation.y = Math.PI;

      this.scene.add(this.sofa);
      this.selectableObjects.push(this.sofa);

      this.applyColorToObject(this.sofa, '#888888');
    });
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

    // get color from state or from dataTransfer
    const colorFromState = this.currentDragColor;
    const colorFromEvent = event.dataTransfer?.getData('text/plain') || null;
    const color = colorFromState || colorFromEvent;

    if (!color) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // raycast against *all selectable objects* (floors, walls, roofs, sofa…)
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
}
