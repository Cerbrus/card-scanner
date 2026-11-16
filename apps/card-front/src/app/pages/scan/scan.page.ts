import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable, catchError, filter, finalize, from, of, switchMap, tap } from 'rxjs';

import { CardDetailsComponent, SavedDetails } from '../../components/card-details/card-details.component';
import { CropEditorComponent } from '../../components/crop-editor/crop-editor.component';
import { CameraShot, LiveCameraComponent } from '../../components/live-camera/live-camera.component';
import { CardDetail, PhotoSide } from '../../models';
import { ApiService } from '../../services/api.service';
import { Camera } from '../../services/camera';
import { CardText } from '../../services/card-text';
import { CardTextReader } from '../../services/card-text-reader';
import { CollectionStore } from '../../services/collection.store';
import { Corners } from '../../services/perspective';
import { PhotoScaler, ScaledPhoto } from '../../services/photo-scaler';
import { ToastService } from '../../services/toast.service';

interface Shot extends ScaledPhoto {
    preview: string;
}

interface TextReading {
    done: boolean;
    text?: CardText;
    result: Promise<CardText | undefined>;
}

interface Cropping {
    side: PhotoSide;
    file: Blob;
    url: string;
}

const SIDES: Array<PhotoSide> = ['front', 'back'];
const READ_WAIT_MILLISECONDS = 20_000;
const CAMERA_CHOICE_KEY = 'scan-camera';

function phoneCameraChosen(): boolean {
    try {
        return localStorage.getItem(CAMERA_CHOICE_KEY) === 'phone';
    } catch {
        return false;
    }
}

@Component({
    selector: 'app-scan-page',
    standalone: true,
    imports: [TranslatePipe, CropEditorComponent, CardDetailsComponent, LiveCameraComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './scan.page.html',
    styleUrl: './scan.page.scss'
})
export class ScanPage {
    protected readonly sides = SIDES;
    protected readonly shots = signal<Partial<Record<PhotoSide, Shot>>>({});
    protected readonly busy = signal<PhotoSide | 'saving' | undefined>(undefined);
    protected readonly saved = signal(0);
    protected readonly cropping = signal<Cropping | undefined>(undefined);
    protected readonly textReading = signal<TextReading | undefined>(undefined);
    protected readonly details = signal<CardDetail | undefined>(undefined);
    protected readonly complete = computed(() => SIDES.every((side) => this.shots()[side]));
    protected readonly nextSide = computed(() => SIDES.find((side) => !this.shots()[side]) ?? 'back');
    protected readonly cameraPaused = computed(() => this.details() !== undefined || this.cropping() !== undefined || this.busy() !== undefined || this.complete());
    protected readonly store = inject(CollectionStore);

    private readonly camera = inject(Camera);
    protected readonly canUseLiveCamera = this.camera.available();
    protected readonly live = signal(this.canUseLiveCamera && !phoneCameraChosen());

    private readonly api = inject(ApiService);
    private readonly scaler = inject(PhotoScaler);
    private readonly reader = inject(CardTextReader);
    private readonly toasts = inject(ToastService);
    private readonly translate = inject(TranslateService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly router = inject(Router);
    private left = false;

    constructor() {
        this.destroyRef.onDestroy(() => {
            this.left = true;
            this.forget();
            this.stopCropping();
        });
    }

    protected choose(side: PhotoSide, event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (file) {
            this.crop(side, file);
        }
    }

    protected retake(side: PhotoSide): void {
        const shot = this.shots()[side];
        if (this.live() && shot && !this.busy()) {
            this.release(shot);
            this.shots.update(({ [side]: _dropped, ...kept }) => kept);
            if (side === 'front') {
                this.textReading.set(undefined);
            }
        }
    }

    protected taken({ file, corners, side }: CameraShot): void {
        if (corners) {
            void this.process(side, file, corners);
        } else {
            this.crop(side, file);
        }
    }

    protected cameraFailed(): void {
        this.toasts.show({ kind: 'error', text: this.translate.instant('scan.unreadable') });
    }

    protected cameraUnavailable(): void {
        this.live.set(false);
        this.toasts.show({ kind: 'error', text: this.translate.instant('scan.camera.unavailable') });
    }

    protected useLiveCamera(live: boolean): void {
        this.live.set(live);
        try {
            localStorage.setItem(CAMERA_CHOICE_KEY, live ? 'live' : 'phone');
        } catch {
            return;
        }
    }

    protected stopCropping(): void {
        const cropping = this.cropping();
        if (cropping) {
            URL.revokeObjectURL(cropping.url);
            this.cropping.set(undefined);
        }
    }

    protected cropped(corners: Corners | undefined): void {
        const cropping = this.cropping();
        if (cropping) {
            this.stopCropping();
            void this.process(cropping.side, cropping.file, corners);
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
            if (shot.source) {
                form.append(`${side}Source`, shot.source, `${side}-source.jpg`);
            }
        }

        this.busy.set('saving');
        from(this.textForSaving())
            .pipe(
                switchMap((text) => {
                    for (const [field, value] of Object.entries(text ?? {})) {
                        if (value) {
                            form.append(field, value);
                        }
                    }

                    return this.api.createCard(form);
                }),
                tap((card) => {
                    this.store.put(card);
                    this.forget();
                }),
                filter(() => !this.left),
                switchMap((card) => this.api.getCard(card.id).pipe(catchError(() => this.storedWithoutDetails()))),
                tap((card) => this.details.set(card)),
                catchError(() => {
                    this.toasts.show({ kind: 'error', text: this.translate.instant('scan.failed') });

                    return of(undefined);
                }),
                finalize(() => this.busy.set(undefined))
            )
            .subscribe();
    }

    protected detailsSaved({ card, then }: SavedDetails): void {
        this.store.put(card);
        this.details.set(undefined);
        this.saved.update((count) => count + 1);
        this.toasts.show({ kind: 'ok', text: this.translate.instant('scan.saved') });
        if (then === 'stop') {
            void this.router.navigateByUrl('/collection');
        }
    }

    protected detailsDiscarded(id: number): void {
        this.store.drop(id);
        this.details.set(undefined);
        this.toasts.show({ kind: 'ok', text: this.translate.instant('scan.discarded') });
    }

    protected detailsFailed(): void {
        this.toasts.show({ kind: 'error', text: this.translate.instant('common.failed') });
    }

    protected forget(): void {
        SIDES.forEach((side) => this.release(this.shots()[side]));
        this.shots.set({});
        this.textReading.set(undefined);
    }

    private storedWithoutDetails(): Observable<undefined> {
        this.saved.update((count) => count + 1);
        this.toasts.show({ kind: 'ok', text: this.translate.instant('scan.savedUnopened') });

        return of(undefined);
    }

    private crop(side: PhotoSide, file: Blob): void {
        this.stopCropping();
        this.cropping.set({ side, file, url: URL.createObjectURL(file) });
    }

    private async process(side: PhotoSide, file: Blob, corners?: Corners): Promise<void> {
        this.busy.set(side);
        try {
            const scaled = corners ? await this.scaler.straighten(file, corners) : await this.scaler.scale(file);
            if (this.left) {
                return;
            }
            this.release(this.shots()[side]);
            this.shots.update((shots) => ({ ...shots, [side]: { ...scaled, preview: URL.createObjectURL(scaled.thumb) } }));
            if (side === 'front') {
                this.readText(corners ? scaled.photo : undefined);
            }
        } catch {
            this.toasts.show({ kind: 'error', text: this.translate.instant('scan.unreadable') });
        } finally {
            this.busy.set(undefined);
        }

        if (this.complete() && !this.left) {
            this.save();
        }
    }

    private readText(cardPhoto?: Blob): void {
        if (!cardPhoto) {
            this.textReading.set(undefined);
            return;
        }

        const result = this.reader.read(cardPhoto).catch(() => undefined);
        const reading: TextReading = { done: false, result };
        this.textReading.set(reading);
        void result.then((text) => {
            if (this.textReading() === reading) {
                this.textReading.set({ ...reading, done: true, text });
            }
        });
    }

    private textForSaving(): Promise<CardText | undefined> {
        const reading = this.textReading();
        if (!reading) {
            return Promise.resolve(undefined);
        }

        return Promise.race([reading.result, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), READ_WAIT_MILLISECONDS))]);
    }

    private release(shot?: Shot): void {
        if (shot) {
            URL.revokeObjectURL(shot.preview);
        }
    }
}
