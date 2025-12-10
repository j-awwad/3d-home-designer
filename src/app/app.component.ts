// src/app/app.component.ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  Signal,
  ViewChild,
} from '@angular/core';
import { signal, computed } from '@angular/core';
import { RoomService } from './services/room.service';
import { FurnitureService } from './services/furniture.service';
import { ThreeJsService } from './services/three-js.service';
import * as THREE from 'three';
import { RoomConfig } from './models/room-config';
import { FurnitureConfig } from './models/furniture-config';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  standalone: true,
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  colors = [
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

  houseWidth = signal(10);
  houseDepth = signal(10);
  roomCount = signal(1);

  rooms!: Signal<RoomConfig[]>;
  selectedRoomId!: Signal<number | null>;
  selectedRoom!: Signal<RoomConfig | null>;
  furnitureItems!: Signal<FurnitureConfig[]>;

  private dragColor: string | null = null;

  constructor(
    private roomSvc: RoomService,
    private furnSvc: FurnitureService,
    private threeSvc: ThreeJsService
  ) {
    this.rooms = this.roomSvc.rooms;
    this.selectedRoomId = this.roomSvc.selectedRoomId;
    this.selectedRoom = computed(() => this.roomSvc.getSelectedRoom());
    this.furnitureItems = this.furnSvc.items;
  }

  ngAfterViewInit(): void {
    this.threeSvc.init(this.canvasRef.nativeElement);
    this.buildRoomsFromCount();
    this.threeSvc.startRenderLoop();
  }

  ngOnDestroy(): void {
    this.threeSvc.stopRenderLoop();
    this.threeSvc.dispose();
  }

  updateHouseWidth(val: number) {
    this.houseWidth.set(Math.max(1, val || 0));
  }
  updateHouseDepth(val: number) {
    this.houseDepth.set(Math.max(1, val || 0));
  }

  buildRoomsFromCount() {
    this.roomSvc.createRooms(this.roomCount());
    this.rebuildHouse();
  }

  selectRoom(id: number) {
    this.roomSvc.selectRoom(id);
  }

  updateRoomField(roomId: number, key: keyof RoomConfig, val: any) {
    this.roomSvc.updateField(roomId, key, val);
  }

  rebuildHouse() {
    this.threeSvc.buildPlot(this.houseWidth(), this.houseDepth());
    this.threeSvc.buildRooms(this.rooms());
    this.threeSvc.reattachFurniture(
      this.furnitureItems(),
      this.furnSvc.getAllObjects()
    );
  }

  addFurniture(url: string, name: string) {
    this.furnSvc.add(url, name, this.selectedRoomId(), (obj) =>
      this.threeSvc.addObject(obj)
    );
  }

  lockFurnitureToSelectedRoom() {
    const sel = this.threeSvc.getSelected();
    if (!sel) return;
    const id = sel.userData['furnitureId'] as number;
    if (!id) return;
    const room = this.selectedRoom();
    if (!room) return;

    this.furnSvc.updateField(id, 'lockedToRoom', true);
    this.furnSvc.updateField(id, 'roomId', room.id);

    const obj = this.furnSvc.getObject(id)!;
    const group = this.threeSvc.getRoomGroup(room.id)!;
    obj.updateMatrixWorld();
    const pos = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    group.worldToLocal(pos);

    this.furnSvc.updateField(id, 'x', pos.x);
    this.furnSvc.updateField(id, 'y', pos.y);
    this.furnSvc.updateField(id, 'z', pos.z);

    const item = this.furnitureItems().find((f) => f.id === id)!;
    this.threeSvc.reparent(obj, group);
    this.furnSvc.setTransform(item, obj);
  }

  unlockFurniture() {
    const sel = this.threeSvc.getSelected();
    if (!sel) return;
    const id = sel.userData['furnitureId'] as number;
    if (!id) return;

    const obj = this.furnSvc.getObject(id)!;
    obj.updateMatrixWorld();
    const pos = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);

    this.furnSvc.updateField(id, 'lockedToRoom', false);
    this.furnSvc.updateField(id, 'roomId', null);
    this.furnSvc.updateField(id, 'x', pos.x);
    this.furnSvc.updateField(id, 'y', pos.y);
    this.furnSvc.updateField(id, 'z', pos.z);

    const item = this.furnitureItems().find((f) => f.id === id)!;
    this.threeSvc.reparent(obj);
    this.furnSvc.setTransform(item, obj);
  }

  onSwatchClick(color: string) {
    this.threeSvc.applyColor(this.threeSvc.getSelected(), color);
  }

  randomizeSelectedColor() {
    const color =
      '#' +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0');
    this.threeSvc.applyColor(this.threeSvc.getSelected(), color);
  }

  onColorDragStart(e: DragEvent, color: string) {
    this.dragColor = color;
    e.dataTransfer?.setData('text/plain', color);
  }

  onCanvasDragOver(e: DragEvent) {
    e.preventDefault();
  }

  onCanvasDrop(e: DragEvent) {
    const color =
      this.dragColor || e.dataTransfer?.getData('text/plain') || null;
    this.threeSvc.handleDrop(e, this.canvasRef.nativeElement, color);
    this.dragColor = null;
  }

  onCanvasClick(e: MouseEvent) {
    this.threeSvc.handleClick(e, this.canvasRef.nativeElement);
  }

  moveSelectedRoom(dx: number, dz: number) {
    const sel = this.threeSvc.getSelected();
    if (!sel) return;
    const group = this.threeSvc.findRoomGroup(sel);
    if (!group) return;
    const id = group.userData['roomId'] as number;

    const room = this.rooms().find((r) => r.id === id);
    if (!room) return;

    let newX = group.position.x + dx;
    let newZ = group.position.z + dz;

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

    group.position.set(newX, 0, newZ);
    this.roomSvc.updateField(id, 'x', newX);
    this.roomSvc.updateField(id, 'z', newZ);
    this.threeSvc.updateHighlight();
  }

  moveSelectedFurniture(dx: number, dz: number) {
    const sel = this.threeSvc.getSelected();
    if (!sel) return;
    const id = sel.userData['furnitureId'] as number;
    if (!id) return;

    const item = this.furnitureItems().find((f) => f.id === id);
    if (!item) return;

    const obj = this.furnSvc.getObject(id)!;

    obj.position.x += dx;
    obj.position.z += dz;

    this.furnSvc.updateField(id, 'x', obj.position.x);
    this.furnSvc.updateField(id, 'z', obj.position.z);

    this.threeSvc.updateHighlight();
  }

  adjustSelectedFurnitureHeight(dy: number) {
    const sel = this.threeSvc.getSelected();
    if (!sel) return;
    const id = sel.userData['furnitureId'] as number;
    if (!id) return;

    const obj = this.furnSvc.getObject(id)!;

    obj.position.y += dy;

    this.furnSvc.updateField(id, 'y', obj.position.y);

    this.threeSvc.updateHighlight();
  }

  scaleSelectedFurniture(factor: number) {
    const sel = this.threeSvc.getSelected();
    if (!sel) return;
    const id = sel.userData['furnitureId'] as number;
    if (!id) return;

    const item = this.furnitureItems().find((f) => f.id === id);
    if (!item) return;

    const obj = this.furnSvc.getObject(id)!;

    const newScale = Math.max(0.1, item.scale * factor);

    obj.scale.set(newScale, newScale, newScale);

    this.furnSvc.updateField(id, 'scale', newScale);

    this.threeSvc.updateHighlight();
  }

  rotateSelectedFurniture(deltaDegrees: number) {
    const sel = this.threeSvc.getSelected();
    if (!sel) return;
    const id = sel.userData['furnitureId'] as number;
    if (!id) return;

    const item = this.furnitureItems().find((f) => f.id === id);
    if (!item) return;

    const obj = this.furnSvc.getObject(id)!;

    const deltaRad = (deltaDegrees * Math.PI) / 180;
    const newRot = item.rotationY + deltaRad;

    obj.rotation.y = newRot;

    this.furnSvc.updateField(id, 'rotationY', newRot);

    this.threeSvc.updateHighlight();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(e: KeyboardEvent) {
    const step = 0.5;
    const sel = this.threeSvc.getSelected();
    if (!sel) return;

    const isFurn = !!sel.userData['furnitureId'];
    const isRoom = !!this.threeSvc.findRoomGroup(sel);

    if (isFurn) {
      switch (e.key.toLowerCase()) {
        case 'a':
          this.moveSelectedFurniture(-step, 0);
          break;
        case 'd':
          this.moveSelectedFurniture(step, 0);
          break;
        case 'w':
          this.moveSelectedFurniture(0, -step);
          break;
        case 's':
          this.moveSelectedFurniture(0, step);
          break;
        case 'q':
          this.adjustSelectedFurnitureHeight(0.1);
          break;
        case 'e':
          this.adjustSelectedFurnitureHeight(-0.1);
          break;
      }
    } else if (isRoom) {
      switch (e.key) {
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
