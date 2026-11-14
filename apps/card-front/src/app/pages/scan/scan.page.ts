import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, finalize, of, tap } from 'rxjs';

import { PhotoSide } from '../../models';
import { ApiService } from '../../services/api.service';
import { CollectionStore } from '../../services/collection.store';
import { PhotoScaler, ScaledPhoto } from '../../services/photo-scaler';
import { ToastService } from '../../services/toast.service';

interface Shot extends ScaledPhoto {
    preview: string;
}

const SIDES: Array<PhotoSide> = ['front', 'back'];

@Component({
    selector: 'app-scan-page',
    standalone: true,
    imports: [RouterLink, TranslateModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './scan.page.html',
    styleUrl: './scan.page.scss'
})
export class ScanPage {
    protected readonly sides = SIDES;
    protected readonly shots = signal<Partial<Record<PhotoSide, Shot>>>({});
    protected readonly busy = signal<PhotoSide | 'saving' | undefined>(undefined);
    protected readonly saved = signal(0);
    protected readonly complete = computed(() => SIDES.every((side) => this.shots()[side]));
    protected readonly store = inject(CollectionStore);

    private readonly api = inject(ApiService);
    private readonly scaler = inject(PhotoScaler);
    private readonly toasts = inject(ToastService);
    private readonly translate = inject(TranslateService);
    private readonly destroyRef = inject(DestroyRef);

    constructor() {
        this.destroyRef.onDestroy(() => this.forget());
    }

    protected async choose(side: PhotoSide, event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) {
            return;
        }

        this.busy.set(side);
        try {
            const scaled = await this.scaler.scale(file);
            this.release(this.shots()[side]);
            this.shots.update((shots) => ({ ...shots, [side]: { ...scaled, preview: URL.createObjectURL(scaled.thumb) } }));
        } catch {
            this.toasts.show({ kind: 'error', text: this.translate.instant('scan.unreadable') });
        } finally {
            this.busy.set(undefined);
        }
    }

    protected save(): void {
        const shots = this.shots();
        const form = new FormData();
        for (const side of SIDES) {
            const shot = shots[side];
            if (!shot) {
                return;
            }
            form.append(side, shot.photo, `${side}.jpg`);
            form.append(`${side}Thumb`, shot.thumb, `${side}-thumb.jpg`);
        }

        this.busy.set('saving');
        this.api
            .createCard(form)
            .pipe(
                tap((card) => {
                    this.store.put(card);
                    this.saved.update((count) => count + 1);
                    this.forget();
                    this.toasts.show({ kind: 'ok', text: this.translate.instant('scan.saved') });
                }),
                catchError(() => {
                    this.toasts.show({ kind: 'error', text: this.translate.instant('scan.failed') });

                    return of(undefined);
                }),
                finalize(() => this.busy.set(undefined)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    protected forget(): void {
        SIDES.forEach((side) => this.release(this.shots()[side]));
        this.shots.set({});
    }

    private release(shot?: Shot): void {
        if (shot) {
            URL.revokeObjectURL(shot.preview);
        }
    }
}
