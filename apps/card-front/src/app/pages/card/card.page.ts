import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, catchError, exhaustMap, finalize, from, map, merge, of, switchMap, takeWhile, tap, timer } from 'rxjs';

import { CandidateListComponent } from '../../components/candidate-list/candidate-list.component';
import { cardState } from '../../components/card-tile/card-tile.component';
import { CropEditorComponent } from '../../components/crop-editor/crop-editor.component';
import { FilterMenuComponent } from '../../components/filter-menu/filter-menu.component';
import { PhotoViewerComponent, ViewedPhoto } from '../../components/photo-viewer/photo-viewer.component';
import { CONDITIONS, Candidate, CardChanges, CardDetail, FINISHES, LANGUAGES, PhotoSide } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CollectionStore } from '../../services/collection.store';
import { Corners } from '../../services/perspective';
import { PhotoScaler } from '../../services/photo-scaler';
import { ToastService } from '../../services/toast.service';

interface StripPhoto extends ViewedPhoto {
    thumb: string;
    side?: PhotoSide;
}

interface Editing {
    side: PhotoSide;
    file: Blob;
    url: string;
    stored: boolean;
}

const POLL_MILLISECONDS = 2500;
const SIDES: Array<PhotoSide> = ['front', 'back'];
const HISTORY_LENGTH = 8;
const GRADING_MIN_VALUE = 50;

@Component({
    selector: 'app-card-page',
    standalone: true,
    imports: [CurrencyPipe, DatePipe, RouterLink, TranslatePipe, CandidateListComponent, CropEditorComponent, FilterMenuComponent, PhotoViewerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './card.page.html',
    styleUrl: './card.page.scss'
})
export class CardPage {
    public readonly id = input.required<string>();

    protected readonly languages = LANGUAGES;
    protected readonly finishes = FINISHES;
    protected readonly conditions = CONDITIONS;
    protected readonly card = signal<CardDetail | undefined>(undefined);
    protected readonly missing = signal(false);
    protected readonly searching = signal(false);
    protected readonly searchOpen = signal(false);
    protected readonly results = signal<Array<Candidate> | undefined>(undefined);
    protected readonly deleteAsked = signal(false);
    protected readonly visionEnabled = signal(false);
    protected readonly viewing = signal<number | undefined>(undefined);
    protected readonly editing = signal<Editing | undefined>(undefined);
    protected readonly savingPhoto = signal(false);
    protected readonly strip = computed(() => {
        const card = this.card();
        if (!card) {
            return [];
        }

        const photos: Array<StripPhoto> = SIDES.filter((side) => card.photos[side] !== undefined).map((side) => {
            const id = card.photos[side] as number;

            return { side, src: this.api.photoUrl(id), thumb: this.api.photoUrl(id, true), label: `scan.${side}` };
        });
        if (card.status === 'confirmed' && card.image) {
            photos.push({ src: `${card.image}/high.webp`, thumb: `${card.image}/low.webp`, label: 'card.reference' });
        }

        return photos;
    });

    protected readonly state = computed(() => {
        const card = this.card();

        return card ? cardState(card) : 'unknown';
    });

    protected readonly otherCopies = computed(() => {
        const card = this.card();

        return card ? this.store.copiesOf(card).filter((copy) => copy.id !== card.id) : [];
    });

    protected readonly gradingMinimum = GRADING_MIN_VALUE;
    protected readonly history = computed(() => (this.card()?.priceHistory ?? []).slice(-HISTORY_LENGTH).reverse());
    protected readonly api = inject(ApiService);
    protected readonly auth = inject(AuthService);

    private readonly store = inject(CollectionStore);
    private readonly scaler = inject(PhotoScaler);
    private readonly toasts = inject(ToastService);
    private readonly translate = inject(TranslateService);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);
    private readonly reload$ = new Subject<void>();

    constructor() {
        merge(toObservable(this.id), this.reload$.pipe(map(() => this.id())))
            .pipe(
                switchMap((id) => this.follow(Number(id))),
                takeUntilDestroyed()
            )
            .subscribe();

        this.api
            .getSystem()
            .pipe(
                tap((system) => this.visionEnabled.set(system.vision.enabled)),
                catchError(() => of(undefined)),
                takeUntilDestroyed()
            )
            .subscribe();

        this.destroyRef.onDestroy(() => this.stopEditing());
    }

    protected recrop(side: PhotoSide): void {
        const photoId = this.card()?.photos[side];
        if (photoId === undefined) {
            return;
        }

        this.api
            .getPhoto(photoId, true)
            .pipe(
                catchError(() => this.api.getPhoto(photoId)),
                tap((photo) => this.startEditing(side, photo, true)),
                catchError(() => this.fail()),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    protected replace(side: PhotoSide, event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (file) {
            this.startEditing(side, file, false);
        }
    }

    protected stopEditing(): void {
        const editing = this.editing();
        if (editing) {
            URL.revokeObjectURL(editing.url);
            this.editing.set(undefined);
        }
    }

    protected saveEdited(corners: Corners | undefined): void {
        const editing = this.editing();
        if (!editing) {
            return;
        }
        this.stopEditing();
        this.savingPhoto.set(true);

        from(corners ? this.scaler.straighten(editing.file, corners) : this.scaler.scale(editing.file))
            .pipe(
                switchMap((scaled) => this.api.replacePhoto(Number(this.id()), editing.side, scaled, editing.stored)),
                tap((card) => {
                    this.show(card);
                    this.toasts.show({ kind: 'ok', text: this.translate.instant('card.photo.saved') });
                }),
                catchError(() => this.fail()),
                finalize(() => this.savingPhoto.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    protected change(changes: CardChanges): void {
        this.run(this.api.updateCard(Number(this.id()), changes));
    }

    protected setOwnPrice(text: string): void {
        const entered = text.trim().replace(',', '.');
        const price = Number(entered);
        if (entered && !(price >= 0)) {
            this.fail();
            return;
        }

        this.change({ ownPrice: entered ? Math.round(price * 100) / 100 : null });
    }

    protected confirm(candidate: Candidate): void {
        this.searchOpen.set(false);
        this.results.set(undefined);
        this.run(this.api.confirmCard(Number(this.id()), candidate.catalogCardId));
    }

    protected readAgain(): void {
        this.api
            .readCard(Number(this.id()))
            .pipe(
                tap(() => this.reload$.next()),
                catchError(() => this.fail()),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    protected search(name: string, number: string): void {
        this.searching.set(true);
        this.api
            .searchCatalog(name, number)
            .pipe(
                tap((results) => this.results.set(results)),
                catchError(() => this.fail()),
                finalize(() => this.searching.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    protected remove(): void {
        const id = Number(this.id());
        this.api
            .deleteCard(id)
            .pipe(
                tap(() => {
                    this.store.drop(id);
                    void this.router.navigateByUrl('/collection');
                }),
                catchError(() => this.fail()),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    private startEditing(side: PhotoSide, file: Blob, stored: boolean): void {
        this.stopEditing();
        this.viewing.set(undefined);
        this.editing.set({ side, file, url: URL.createObjectURL(file), stored });
    }

    private follow(id: number): Observable<CardDetail | undefined> {
        this.missing.set(false);

        return timer(0, POLL_MILLISECONDS).pipe(
            exhaustMap(() => this.api.getCard(id)),
            tap((card) => this.show(card)),
            takeWhile((card) => card.readingState === 'pending', true),
            catchError(() => {
                this.missing.set(true);

                return of(undefined);
            })
        );
    }

    private run(request: Observable<CardDetail>): void {
        request
            .pipe(
                tap((card) => this.show(card)),
                catchError(() => this.fail()),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    private show(card: CardDetail): void {
        this.card.set(card);
        this.store.put(card);
    }

    private fail(): Observable<undefined> {
        this.toasts.show({ kind: 'error', text: this.translate.instant('common.failed') });

        return of(undefined);
    }
}
