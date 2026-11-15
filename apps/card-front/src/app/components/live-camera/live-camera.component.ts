import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { PhotoSide } from '../../models';
import { Camera } from '../../services/camera';
import { CaptureTrigger, middleColour } from '../../services/capture-trigger';
import { findCard } from '../../services/card-finder';
import { CropStart } from '../../services/crop-start';
import { Corners, Point } from '../../services/perspective';
import { DASH_SHARE, LINE_SHARE } from '../crop-editor/crop-editor.component';

export interface CameraShot {
    file: Blob;
    corners?: Corners;
}

const FRAME_SIDE = 320;
const LOOK_EVERY_MILLISECONDS = 100;
const FOLLOW_MILLISECONDS = 90;
const LOST_JUMP_MILLISECONDS = 600;
const CORNER_SHARE = 0.06;
const AUTO_KEY = 'scan-auto-photo';

function autoChosen(): boolean {
    try {
        return localStorage.getItem(AUTO_KEY) === 'on';
    } catch {
        return false;
    }
}

export function roundedOutline(corners: Corners): string {
    const radius = Math.min(distance(corners[0], corners[1]), distance(corners[1], corners[2])) * CORNER_SHARE;
    const toward = (from: Point, to: Point): Point => {
        const length = distance(from, to) || 1;

        return { x: from.x + ((to.x - from.x) / length) * radius, y: from.y + ((to.y - from.y) / length) * radius };
    };
    const parts = corners.map((corner, index) => {
        const before = toward(corner, corners[(index + 3) % 4]);
        const after = toward(corner, corners[(index + 1) % 4]);

        return `${index ? 'L' : 'M'}${before.x} ${before.y}Q${corner.x} ${corner.y} ${after.x} ${after.y}`;
    });

    return `${parts.join('')}Z`;
}

function distance(from: Point, to: Point): number {
    return Math.hypot(to.x - from.x, to.y - from.y);
}

@Component({
    selector: 'app-live-camera',
    standalone: true,
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="stage">
            <div class="frame">
                <video #video class="video" autoplay playsinline muted></video>
                @if (size(); as size) {
                    <svg class="overlay" [attr.viewBox]="'0 0 ' + size.width + ' ' + size.height">
                        @if (outline(); as path) {
                            <path class="edge" [class.lost]="lost()" [attr.d]="path" [attr.stroke-width]="line()" [attr.stroke-dasharray]="dash()" />
                        }
                    </svg>
                }
                <span class="badge">{{ 'scan.' + side() | translate }}</span>
                <button type="button" class="auto" [class.on]="auto()" [attr.aria-pressed]="auto()" [attr.title]="'scan.camera.autoHint' | translate" (click)="toggleAuto()">
                    <i class="material-symbols-outlined">{{ auto() ? 'motion_photos_auto' : 'motion_photos_off' }}</i>
                    {{ 'scan.camera.auto' | translate }}
                </button>
                @if (capturing()) {
                    <span class="flash"></span>
                }
                <button
                    type="button"
                    class="shutter"
                    [disabled]="!ready() || capturing() || paused()"
                    [attr.aria-label]="'scan.camera.shutter' | translate: { side: ('scan.' + side() | translate) }"
                    (click)="capture()"
                >
                    <i class="material-symbols-outlined">photo_camera</i>
                </button>
            </div>
        </div>
    `,
    styles: `
        :host { display: block; }
        :host(.hidden) { display: none; }
        .stage { display: flex; justify-content: center; }
        .frame { position: relative; max-width: 100%; }
        .video { display: block; max-width: 100%; max-height: 62vh; border-radius: 12px; background: var(--viewer-back); }
        .overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
        .edge { fill: none; stroke: var(--grading-mark); stroke-linejoin: round; transition: opacity 0.2s; }
        .edge.lost { opacity: 0; }
        .badge { position: absolute; top: 8px; left: 8px; padding: 4px 10px; border-radius: 999px; background: var(--viewer-back); color: var(--mark-text); font-size: 0.85rem; font-weight: 600; }
        .auto { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 4px; padding: 4px 10px 4px 6px; border-radius: 999px; background: var(--viewer-back); color: var(--mark-text); font-size: 0.85rem; font-weight: 600; }
        .auto i { font-size: 20px; }
        .auto.on { background: var(--accent); color: var(--accent-text); }
        .flash { position: absolute; inset: 0; border-radius: 12px; background: var(--mark-text); opacity: 0.35; }
        .shutter { position: absolute; bottom: 14px; left: 50%; display: grid; place-items: center; width: 68px; height: 68px; transform: translateX(-50%); border: 4px solid var(--mark-text); border-radius: 50%; background: var(--crop-shade); color: var(--mark-text); }
        .shutter i { font-size: 30px; }
        .shutter:disabled { opacity: 0.5; }
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
    protected readonly size = signal<{ width: number; height: number } | undefined>(undefined);
    protected readonly outline = signal<string | undefined>(undefined);
    protected readonly lost = signal(true);
    protected readonly auto = signal(autoChosen());
    protected readonly line = computed(() => this.longest() * LINE_SHARE);
    protected readonly dash = computed(() => `${this.longest() * DASH_SHARE} ${this.longest() * DASH_SHARE * 0.7}`);

    private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
    private readonly camera = inject(Camera);
    private readonly cropStart = inject(CropStart);
    private readonly trigger = new CaptureTrigger();
    private readonly longest = computed(() => Math.max(this.size()?.width ?? 1, this.size()?.height ?? 1));
    private stream?: MediaStream;
    private timer?: ReturnType<typeof setTimeout>;
    private frameRequest?: number;
    private canvas?: HTMLCanvasElement;
    private target?: Corners;
    private shown?: Corners;
    private colour?: [number, number, number];
    private lostSince = 0;
    private lastFrame = 0;
    private stopped = false;

    constructor() {
        afterNextRender(() => void this.start());
        inject(DestroyRef).onDestroy(() => this.stop());
    }

    protected toggleAuto(): void {
        this.auto.update((auto) => !auto);
        this.trigger.reset();
        try {
            localStorage.setItem(AUTO_KEY, this.auto() ? 'on' : 'off');
        } catch {
            return;
        }
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
        this.frameRequest = requestAnimationFrame((time) => this.follow(time));
    }

    private look(): void {
        if (this.stopped) {
            return;
        }

        const found = this.paused() || this.capturing() ? undefined : this.findInFrame();
        const now = performance.now();
        if (!found && this.target) {
            this.lostSince = now;
        }
        if (found && !this.target && now - this.lostSince > LOST_JUMP_MILLISECONDS) {
            this.shown = found;
        }
        this.target = found;
        if (this.auto() && !this.paused() && !this.capturing() && this.trigger.see({ corners: this.relative(found), colour: this.colour, time: now })) {
            void this.capture();
        }
        this.timer = setTimeout(() => this.look(), LOOK_EVERY_MILLISECONDS);
    }

    private relative(corners?: Corners): Corners | undefined {
        const size = this.size();

        return size && corners ? (corners.map(({ x, y }) => ({ x: x / size.width, y: y / size.height })) as Corners) : undefined;
    }

    private follow(time: number): void {
        if (this.stopped) {
            return;
        }

        const elapsed = this.lastFrame ? time - this.lastFrame : 0;
        this.lastFrame = time;
        const target = this.target;
        if (target) {
            const share = 1 - Math.exp(-elapsed / FOLLOW_MILLISECONDS);
            const from = this.shown ?? target;
            this.shown = from.map((point, index) => ({ x: point.x + (target[index].x - point.x) * share, y: point.y + (target[index].y - point.y) * share })) as Corners;
        }
        this.lost.set(target === undefined);
        this.outline.set(this.shown ? roundedOutline(this.shown) : undefined);
        this.frameRequest = requestAnimationFrame((next) => this.follow(next));
    }

    private findInFrame(): Corners | undefined {
        const video = this.video().nativeElement;
        if (!video.videoWidth || !video.videoHeight) {
            return undefined;
        }

        const size = this.size();
        if (size?.width !== video.videoWidth || size.height !== video.videoHeight) {
            this.size.set({ width: video.videoWidth, height: video.videoHeight });
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
        const factor = video.videoWidth / this.canvas.width;

        return found?.map(({ x, y }) => ({ x: x * factor, y: y * factor })) as Corners | undefined;
    }

    private stop(): void {
        this.stopped = true;
        clearTimeout(this.timer);
        if (this.frameRequest !== undefined) {
            cancelAnimationFrame(this.frameRequest);
        }
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = undefined;
    }
}
