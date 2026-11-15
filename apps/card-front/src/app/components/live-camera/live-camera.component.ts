import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { PhotoSide } from '../../models';
import { Camera } from '../../services/camera';
import { CaptureTrigger, middleColour } from '../../services/capture-trigger';
import { findCard } from '../../services/card-finder';
import { CropStart } from '../../services/crop-start';
import { Corners } from '../../services/perspective';

export interface CameraShot {
    file: Blob;
    corners?: Corners;
}

const FRAME_SIDE = 320;
const LOOK_EVERY_MILLISECONDS = 120;

@Component({
    selector: 'app-live-camera',
    standalone: true,
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="stage">
            <div class="frame">
                <video #video class="video" autoplay playsinline muted></video>
                @if (outline(); as points) {
                    <svg class="overlay" viewBox="0 0 1 1" preserveAspectRatio="none">
                        <polygon class="edge" [attr.points]="points" />
                    </svg>
                }
                <span class="badge">{{ 'scan.' + side() | translate }}</span>
                @if (capturing()) {
                    <span class="flash"></span>
                }
            </div>
        </div>
        <button type="button" class="shutter btn primary mt-3 w-full" [disabled]="!ready() || capturing() || paused()" (click)="capture()">
            <i class="material-symbols-outlined">photo_camera</i>
            {{ 'scan.camera.shutter' | translate: { side: ('scan.' + side() | translate) } }}
        </button>
    `,
    styles: `
        :host { display: block; }
        :host(.hidden) { display: none; }
        .stage { display: flex; justify-content: center; }
        .frame { position: relative; max-width: 100%; }
        .video { display: block; max-width: 100%; max-height: 58vh; border-radius: 12px; background: var(--viewer-back); }
        .overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
        .edge { fill: none; stroke: var(--grading-mark); stroke-width: 3px; vector-effect: non-scaling-stroke; }
        .badge { position: absolute; top: 8px; left: 8px; padding: 4px 10px; border-radius: 999px; background: var(--viewer-back); color: var(--mark-text); font-size: 0.85rem; font-weight: 600; }
        .flash { position: absolute; inset: 0; border-radius: 12px; background: var(--mark-text); opacity: 0.35; }
    `
})
export class LiveCameraComponent {
    public readonly side = input.required<PhotoSide>();
    public readonly paused = input(false);
    public readonly captured = output<CameraShot>();
    public readonly unavailable = output<void>();
    public readonly failed = output<void>();

    protected readonly ready = signal(false);
    protected readonly capturing = signal(false);
    protected readonly outline = signal<string | undefined>(undefined);

    private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
    private readonly camera = inject(Camera);
    private readonly cropStart = inject(CropStart);
    private readonly trigger = new CaptureTrigger();
    private stream?: MediaStream;
    private timer?: ReturnType<typeof setTimeout>;
    private canvas?: HTMLCanvasElement;
    private colour?: [number, number, number];
    private stopped = false;

    constructor() {
        afterNextRender(() => void this.start());
        inject(DestroyRef).onDestroy(() => this.stop());
    }

    protected async capture(): Promise<void> {
        const stream = this.stream;
        if (!stream || this.capturing()) {
            return;
        }

        this.capturing.set(true);
        this.trigger.taken(this.colour);
        try {
            const file = await this.camera.takePhoto(stream, this.video().nativeElement);
            const corners = await this.cropStart.findIn(file);
            this.captured.emit({ file, corners });
        } catch {
            this.failed.emit();
        } finally {
            this.capturing.set(false);
        }
    }

    private async start(): Promise<void> {
        try {
            this.stream = await this.camera.open();
        } catch {
            this.unavailable.emit();

            return;
        }
        if (this.stopped) {
            this.stop();

            return;
        }

        const video = this.video().nativeElement;
        video.srcObject = this.stream;
        await video.play().catch(() => undefined);
        this.ready.set(true);
        this.look();
    }

    private look(): void {
        if (this.stopped) {
            return;
        }

        if (!this.paused() && !this.capturing()) {
            const corners = this.findInFrame();
            this.outline.set(corners?.map(({ x, y }) => `${x},${y}`).join(' '));
            if (this.trigger.see({ corners, colour: this.colour, time: performance.now() })) {
                void this.capture();
            }
        } else {
            this.outline.set(undefined);
        }
        this.timer = setTimeout(() => this.look(), LOOK_EVERY_MILLISECONDS);
    }

    private findInFrame(): Corners | undefined {
        const video = this.video().nativeElement;
        if (!video.videoWidth || !video.videoHeight) {
            return undefined;
        }

        const scale = FRAME_SIDE / Math.max(video.videoWidth, video.videoHeight);
        this.canvas ??= document.createElement('canvas');
        this.canvas.width = Math.round(video.videoWidth * scale);
        this.canvas.height = Math.round(video.videoHeight * scale);
        const context = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            return undefined;
        }
        context.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
        const frame = context.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const found = findCard(frame);
        this.colour = found ? middleColour(frame, found) : undefined;

        return found?.map(({ x, y }) => ({ x: x / frame.width, y: y / frame.height })) as Corners | undefined;
    }

    private stop(): void {
        this.stopped = true;
        clearTimeout(this.timer);
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = undefined;
    }
}
