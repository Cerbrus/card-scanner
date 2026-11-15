import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

export interface ViewedPhoto {
    src: string;
    label: string;
}

const SWIPE_PIXELS = 50;

@Component({
    selector: 'app-photo-viewer',
    standalone: true,
    imports: [TranslateModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        role: 'dialog',
        'aria-modal': 'true',
        '(document:keydown)': 'key($event)'
    },
    template: `
        <div class="viewer" (pointerdown)="swipeFrom = $event.clientX" (pointerup)="swipe($event.clientX)">
            @if (current(); as photo) {
                <img class="shown" [src]="photo.src" [alt]="photo.label | translate" draggable="false" />
                <div class="bar">
                    <span class="label">{{ photo.label | translate }} · {{ index() + 1 }} / {{ photos().length }}</span>
                    <button type="button" class="close" [attr.aria-label]="'viewer.close' | translate" (click)="closed.emit()">
                        <i class="material-symbols-outlined">close</i>
                    </button>
                </div>
            }
            @if (photos().length > 1) {
                <button type="button" class="step previous" [disabled]="!index()" [attr.aria-label]="'viewer.previous' | translate" (click)="go(-1)">
                    <i class="material-symbols-outlined">chevron_left</i>
                </button>
                <button
                    type="button"
                    class="step next"
                    [disabled]="index() === photos().length - 1"
                    [attr.aria-label]="'viewer.next' | translate"
                    (click)="go(1)"
                >
                    <i class="material-symbols-outlined">chevron_right</i>
                </button>
            }
        </div>
    `,
    styles: `
        :host { position: fixed; inset: 0; z-index: 50; display: block; }
        .viewer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--viewer-back); touch-action: pan-y; user-select: none; }
        .shown { max-width: 100%; max-height: 100%; object-fit: contain; }
        .bar {
            position: absolute; top: 0; right: 0; left: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px;
            padding: max(8px, env(safe-area-inset-top)) 8px 8px 16px; background: var(--viewer-bar); color: var(--mark-text);
        }
        .label { font-size: 0.9rem; font-weight: 600; }
        .close, .step { display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--viewer-bar); color: var(--mark-text); }
        .close { width: 44px; height: 44px; }
        .step { position: absolute; top: 50%; width: 48px; height: 48px; transform: translateY(-50%); }
        .step:disabled { opacity: 0.25; }
        .step i, .close i { font-size: 30px; }
        .previous { left: 8px; }
        .next { right: 8px; }
    `
})
export class PhotoViewerComponent {
    public readonly photos = input.required<Array<ViewedPhoto>>();
    public readonly start = input(0);
    public readonly closed = output<void>();

    protected readonly index = linkedSignal(() => Math.min(this.start(), this.photos().length - 1));
    protected readonly current = computed(() => this.photos()[this.index()]);
    protected swipeFrom?: number;

    protected go(step: number): void {
        this.index.update((index) => Math.min(this.photos().length - 1, Math.max(0, index + step)));
    }

    protected swipe(to: number): void {
        const distance = this.swipeFrom === undefined ? 0 : to - this.swipeFrom;
        this.swipeFrom = undefined;
        if (Math.abs(distance) > SWIPE_PIXELS) {
            this.go(distance < 0 ? 1 : -1);
        }
    }

    protected key(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.closed.emit();
        } else if (event.key === 'ArrowLeft') {
            this.go(-1);
        } else if (event.key === 'ArrowRight') {
            this.go(1);
        }
    }
}
