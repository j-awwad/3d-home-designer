// src/app/services/room.service.ts
import { Injectable } from '@angular/core';
import { signal } from '@angular/core';
import { RoomConfig } from '../models/room-config';

@Injectable({ providedIn: 'root' })
export class RoomService {
  rooms = signal<RoomConfig[]>([]);
  selectedRoomId = signal<number | null>(null);
  private nextRoomId = 1;

  createRooms(count: number): void {
    count = Math.max(1, count);
    const newRooms: RoomConfig[] = [];
    for (let i = 0; i < count; i++) {
      newRooms.push({
        id: this.nextRoomId++,
        name: `Room ${i + 1}`,
        width: 6,
        depth: 6,
        x: i * 8,
        z: 0,
        rotationY: 0,
      });
    }
    this.rooms.set(newRooms);
    this.selectedRoomId.set(newRooms[0]?.id ?? null);
  }

  selectRoom(id: number): void {
    this.selectedRoomId.set(id);
  }

  updateField(roomId: number, key: keyof RoomConfig, value: any): void {
    this.rooms.update(rooms => rooms.map(r => r.id === roomId ? { ...r, [key]: value } : r));
  }

  getSelectedRoom(): RoomConfig | null {
    return this.rooms().find(r => r.id === this.selectedRoomId()) ?? null;
  }
}