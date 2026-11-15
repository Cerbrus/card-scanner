import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { Corners, Point, startCorners } from '../../services/perspective';

const HANDLE_SHARE = 0.03;
const TOUCH_SHARE = 0.07;

@Component({
    selector: 'app-crop-editor',
    standalone: true,
    imports: [TranslateModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <p class="muted mb-2 text-sm">{{ 'scan.crop.hint' | translate }}</p>
        <div class="stage">
            <div class="frame">
                <img class="photo" [src]="src()" alt="" (load)="measure($any($event.target))" />
                @if (size(); as size) {
                    <svg
                        class="overlay"
                        [attr.viewBox]="'0 0 ' + size.width + ' ' + size.height"
                        (pointermove)="drag($event)"
                        (pointerup)="dragging.set(undefined)"
                        (pointercancel)="dragging.set(undefined)"
                    >
                        <path class="shade" fill-rule="evenodd" [attr.d]="shade()" />
                        <polygon class="edge" [attr.points]="outline()" [attr.stroke-width]="handle() / 3" />
                        @for (corner of corners(); track $index) {
                            <circle class="handle" [attr.cx]="corner.x" [attr.cy]="corner.y" [attr.r]="handle()" [attr.stroke-width]="handle() / 3" />
                            <circle
                                class="grip"
                                [attr.cx]="corner.x"
                                [attr.cy]="corner.y"
                                [attr.r]="grip()"
                                (pointerdown)="grab($index, $event)"
                            />
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
        :host { display: block; }
        .stage { position: relative; display: flex; justify-content: center; }
        .photo { display: block; max-width: 100%; max-height: 62vh; border-radius: 8px; }
        .frame { position: relative; max-width: 100%; }
        .overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
        .shade { fill: var(--finish-back); }
        .edge { fill: none; stroke: var(--grading-mark); }
        .handle { fill: var(--finish-back); stroke: var(--grading-mark); }
        .grip { fill: transparent; cursor: grab; }
    `
})
export class CropEditorComponent {
    public readonly src = input.required<string>();
    public readonly done = output<Corners | undefined>();
    public readonly cancelled = output<void>();

    protected readonly size = signal<{ width: number; height: number } | undefined>(undefined);
    protected readonly corners = signal<Corners>(startCorners(1, 1));
    protected readonly dragging = signal<number | undefined>(undefined);
    protected readonly handle = computed(() => this.longest() * HANDLE_SHARE);
    protected readonly grip = computed(() => this.longest() * TOUCH_SHARE);
    protected readonly outline = computed(() => this.corners().map(({ x, y }) => `${x},${y}`).join(' '));
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

    protected grab(index: number, event: PointerEvent): void {
        (event.target as Element).setPointerCapture?.(event.pointerId);
        this.dragging.set(index);
    }

    protected drag(event: PointerEvent): void {
        const index = this.dragging();
        const size = this.size();
        if (index === undefined || !size) {
            return;
        }

        const box = (event.currentTarget as Element).getBoundingClientRect();
        const point: Point = {
            x: Math.min(size.width, Math.max(0, ((event.clientX - box.left) / box.width) * size.width)),
            y: Math.min(size.height, Math.max(0, ((event.clientY - box.top) / box.height) * size.height))
        };
        this.corners.update((corners) => corners.map((corner, at) => (at === index ? point : corner)) as Corners);
    }
}
