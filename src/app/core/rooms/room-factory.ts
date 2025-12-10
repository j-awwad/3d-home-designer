import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { RoomConfig } from './room-config.model';

@Injectable({ providedIn: 'root' })
export class RoomFactory {
  private wallHeight = 4;

  createRoom(room: RoomConfig): THREE.Group {
    const group = new THREE.Group();
    group.position.set(room.x, 0, room.z);
    group.rotation.y = room.rotationY;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width, room.depth),
      new THREE.MeshStandardMaterial({ color: 0xe0e0e0 })
    );
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width, this.wallHeight),
      wallMat.clone()
    );
    backWall.position.set(0, this.wallHeight / 2, -room.depth / 2);
    group.add(backWall);

    const frontWall = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width, this.wallHeight),
      wallMat.clone()
    );
    frontWall.position.set(0, this.wallHeight / 2, room.depth / 2);
    frontWall.rotation.y = Math.PI;
    group.add(frontWall);

    const leftWall = new THREE.Mesh(
      new THREE.PlaneGeometry(room.depth, this.wallHeight),
      wallMat.clone()
    );
    leftWall.position.set(-room.width / 2, this.wallHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(
      new THREE.PlaneGeometry(room.depth, this.wallHeight),
      wallMat.clone()
    );
    rightWall.position.set(room.width / 2, this.wallHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    group.add(rightWall);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width, room.depth),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.BackSide })
    );
    roof.rotation.x = Math.PI / 2;
    roof.position.y = this.wallHeight;
    group.add(roof);

    group.userData['isRoom'] = true;
    group.userData['roomId'] = room.id;

    return group;
  }
}
