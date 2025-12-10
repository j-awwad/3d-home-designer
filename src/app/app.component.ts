import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  HostListener,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SceneService } from './core/three/scene.service';
import { ControlsService } from './core/three/controls.service';
import { RoomService } from './core/rooms/room.service';
import { FurnitureService } from './core/furniture/furniture.service';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements AfterViewInit {
  @ViewChild('canvas') canvas!: ElementRef;

  constructor(
    private scene: SceneService,
    private controls: ControlsService,
    private rooms: RoomService,
    private furniture: FurnitureService
  ) {}

  ngAfterViewInit() {
    this.scene.init(this.canvas.nativeElement);
    this.controls.init(this.canvas.nativeElement);

    this.rooms.createDefaultRooms(1);
    this.animate();
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.tick();
    this.scene.renderer.render(this.scene.scene, this.scene.camera);
  };

  addSofa() {
    this.furniture.add('/sofa.glb', 'Sofa');
  }
}

