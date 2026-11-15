import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { Corners, Point, startCorners } from '../../services/perspective';

const HANDLE_SHARE = 0.018;
const TOUCH_SHARE = 0.07;
const LINE_SHARE = 0.0025;
const DASH_SHARE = 0.012;
const LOUPE_SHARE = 0.52;
const LOUPE_MAX_WIDTH_SHARE = 0.7;
const LOUPE_CORNER_SHARE = 0.12;
const LOUPE_MARGIN_SHARE = 0.02;
const TOP_LEFT = 0;
const LOUPE_ZOOM = 3;

let nextEditor = 0;

@Component({
    selector: 'app-crop-editor',
    standalone: true,
    imports: [TranslateModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <p class="muted mb-2 text-sm">{{ 'scan.crop.hint' | translate }}</p>
        <div class="stage">
            <div class="frame">
                <img class="photo" [src]="src()" alt="" draggable="false" (load)="measure($any($event.target))" />
                @if (size(); as size) {
                    <svg
                        class="overlay"
                        [attr.viewBox]="'0 0 ' + size.width + ' ' + size.height"
                        (pointermove)="drag($event)"
                        (pointerup)="dragging.set(undefined)"
                        (pointercancel)="dragging.set(undefined)"
                    >
                        <defs>
                            <clipPath [attr.id]="clipId">
                                <rect [attr.x]="loupe().x" [attr.y]="loupe().y" [attr.width]="loupeSide()" [attr.height]="loupeSide()" [attr.rx]="loupeCorner()" />
                            </clipPath>
                        </defs>
                        <path class="shade" fill-rule="evenodd" [attr.d]="shade()" />
                        <polygon class="edge" [attr.points]="outline()" [attr.stroke-width]="line()" [attr.stroke-dasharray]="dash()" />
                        @for (corner of corners(); track $index) {
                            <circle class="handle" [class.active]="dragging() === $index" [attr.cx]="corner.x" [attr.cy]="corner.y" [attr.r]="handle()" [attr.stroke-width]="line()" />
                            <circle class="grip" [attr.cx]="corner.x" [attr.cy]="corner.y" [attr.r]="grip()" (pointerdown)="grab($index, $event)" />
                        }
                        @if (dragged(); as point) {
                            <g class="loupe" [attr.clip-path]="'url(#' + clipId + ')'">
                                <rect class="loupe-back" [attr.x]="loupe().x" [attr.y]="loupe().y" [attr.width]="loupeSide()" [attr.height]="loupeSide()" />
                                <g [attr.transform]="magnify(point)">
                                    <image [attr.href]="src()" x="0" y="0" [attr.width]="size.width" [attr.height]="size.height" />
                                    <polygon class="edge" [attr.points]="outline()" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="6 4" />
                                </g>
                            </g>
                            <rect
                                class="loupe-ring"
                                [attr.x]="loupe().x"
                                [attr.y]="loupe().y"
                                [attr.width]="loupeSide()"
                                [attr.height]="loupeSide()"
                                [attr.rx]="loupeCorner()"
                                [attr.stroke-width]="line() * 1.5"
                            />
                            <path class="cross" [attr.d]="cross()" [attr.stroke-width]="line()" />
                        }
                    </svg>
                }
            </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="use btn primary grow" [disabled]="!size()" (click)="done.emit(corners())">
                <i class="material-symbols-outlined">crop</i>
                {{ 'scan.crop.use' | translate }}
            </button>
            <button type="button" class="whole btn" (click)="done.emit(undefined)">{{ 'scan.crop.whole' | translate }}</button>
            <button type="button" class="cancel btn" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
        </div>
    `,
    styles: `
        :host { display: block; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .stage { position: relative; display: flex; justify-content: center; }
        .frame { position: relative; max-width: 100%; }
        .photo { display: block; max-width: 100%; max-height: 62vh; border-radius: 8px; pointer-events: none; }
        .overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
        .shade { fill: var(--crop-shade); }
        .edge { fill: none; stroke: var(--grading-mark); }
        .handle { fill: none; stroke: var(--grading-mark); }
        .handle.active { stroke: var(--finish-star); }
        .grip { fill: transparent; cursor: grab; }
        .loupe-ring { fill: none; stroke: var(--mark-text); }
        .loupe-back { fill: var(--viewer-back); }
        .cross { stroke: var(--finish-star); }
    `
})
export class CropEditorComponent {
    public readonly src = input.required<string>();
    public readonly done = output<Corners | undefined>();
    public readonly cancelled = output<void>();

    protected readonly clipId = `crop-loupe-${nextEditor++}`;
    protected readonly size = signal<{ width: number; height: number } | undefined>(undefined);
    protected readonly corners = signal<Corners>(startCorners(1, 1));
    protected readonly dragging = signal<number | undefined>(undefined);
    protected readonly handle = computed(() => this.longest() * HANDLE_SHARE);
    protected readonly grip = computed(() => this.longest() * TOUCH_SHARE);
    protected readonly line = computed(() => this.longest() * LINE_SHARE);
    protected readonly dash = computed(() => `${this.longest() * DASH_SHARE} ${this.longest() * DASH_SHARE * 0.7}`);
    protected readonly loupeSide = computed(() => Math.min(this.longest() * LOUPE_SHARE, (this.size()?.width ?? 1) * LOUPE_MAX_WIDTH_SHARE));
    protected readonly loupeCorner = computed(() => this.loupeSide() * LOUPE_CORNER_SHARE);
    protected readonly outline = computed(() => this.corners().map(({ x, y }) => `${x},${y}`).join(' '));
    protected readonly dragged = computed(() => {
        const index = this.dragging();

        return index === undefined ? undefined : this.corners()[index];
    });

    protected readonly loupe = computed((): Point => {
        const width = this.size()?.width ?? 1;
        const margin = this.longest() * LOUPE_MARGIN_SHARE;

        return { x: this.dragging() === TOP_LEFT ? width - margin - this.loupeSide() : margin, y: margin };
    });

    protected readonly cross = computed(() => {
        const half = this.loupeSide() / 2;
        const x = this.loupe().x + half;
        const y = this.loupe().y + half;
        const arm = half * 0.15;

        return `M${x - arm} ${y}H${x + arm}M${x} ${y - arm}V${y + arm}`;
    });

    protected readonly shade = computed(() => {
        const size = this.size();
        if (!size) {
            return '';
        }
        const [first, ...rest] = this.corners();

        return `M0 0H${size.width}V${size.height}H0Z M${first.x} ${first.y}${rest.map(({ x, y }) => `L${x} ${y}`).join('')}Z`;
    });

    private readonly longest = computed(() => Math.max(this.size()?.width ?? 1, this.size()?.height ?? 1));

    protected measure(image: HTMLImageElement): void {
        this.size.set({ width: image.naturalWidth, height: image.naturalHeight });
        this.corners.set(startCorners(image.naturalWidth, image.naturalHeight));
    }

    protected magnify(point: Point): string {
        const x = this.loupe().x + this.loupeSide() / 2;
        const y = this.loupe().y + this.loupeSide() / 2;

        return `translate(${x - point.x * LOUPE_ZOOM} ${y - point.y * LOUPE_ZOOM}) scale(${LOUPE_ZOOM})`;
    }

    protected grab(index: number, event: PointerEvent): void {
        event.preventDefault();
        (event.target as Element).setPointerCapture?.(event.pointerId);
        this.dragging.set(index);
    }

    protected drag(event: PointerEvent): void {
        const index = this.dragging();
        const size = this.size();
        if (index === undefined || !size) {
            return;
        }

        event.preventDefault();
        const box = (event.currentTarget as Element).getBoundingClientRect();
        const point: Point = {
            x: Math.min(size.width, Math.max(0, ((event.clientX - box.left) / box.width) * size.width)),
            y: Math.min(size.height, Math.max(0, ((event.clientY - box.top) / box.height) * size.height))
        };
        this.corners.update((corners) => corners.map((corner, at) => (at === index ? point : corner)) as Corners);
    }
}
