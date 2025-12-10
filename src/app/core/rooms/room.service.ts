import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { RoomConfig } from './room-config.model';
import { SceneService } from '../three/scene.service';
import { RoomFactory } from './room-factory'

@Injectable({ providedIn: 'root' })
export class RoomService {
  rooms: RoomConfig[] = [];
  roomGroups = new Map<number, THREE.Group>();

  constructor(private scene: SceneService, private factory: RoomFactory) {}

  createDefaultRooms(count: number) {
    this.rooms = [];

    for (let i = 0; i < count; i++) {
      this.rooms.push({
        id: i + 1,
        name: 'Room ' + (i + 1),
        width: 6,
        depth: 6,
        x: i * 8,
        z: 0,
        rotationY: 0,
      });
    }

    this.buildAllRooms();
  }

  buildAllRooms() {
    this.roomGroups.forEach(g => this.scene.scene.remove(g));
    this.roomGroups.clear();

    for (const room of this.rooms) {
      const group = this.factory.createRoom(room);
      this.scene.scene.add(group);
      this.roomGroups.set(room.id, group);
    }
  }

  updateRoom(id: number, key: keyof RoomConfig, value: any) {
    const room = this.rooms.find(r => r.id === id);
    if (!room) return;

    (room as any)[key] = value;
    this.buildAllRooms();
  }
}
