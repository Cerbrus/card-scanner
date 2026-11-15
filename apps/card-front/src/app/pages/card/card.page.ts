import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, catchError, exhaustMap, finalize, map, merge, of, switchMap, takeWhile, tap, timer } from 'rxjs';

import { CandidateListComponent } from '../../components/candidate-list/candidate-list.component';
import { cardState } from '../../components/card-tile/card-tile.component';
import { CONDITIONS, Candidate, CardChanges, CardDetail, FINISHES, LANGUAGES } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CollectionStore } from '../../services/collection.store';
import { ToastService } from '../../services/toast.service';

const POLL_MILLISECONDS = 2500;
const HISTORY_LENGTH = 8;
const GRADING_MIN_VALUE = 50;

@Component({
    selector: 'app-card-page',
    standalone: true,
    imports: [CurrencyPipe, DatePipe, RouterLink, TranslateModule, CandidateListComponent],
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
    }

    protected catalogImage(image?: string): string | undefined {
        return image ? `${image}/low.webp` : undefined;
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
