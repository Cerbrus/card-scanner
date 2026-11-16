import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, linkedSignal, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, catchError, finalize, of, switchMap, tap } from 'rxjs';

import { CONDITIONS, Candidate, CardDetail, Condition, FINISHES, Finish, LANGUAGES, Language } from '../../models';
import { ApiService } from '../../services/api.service';
import { CandidateListComponent } from '../candidate-list/candidate-list.component';
import { languageFlag } from '../card-tile/card-tile.component';

export type AfterSaving = 'next' | 'stop';

export interface SavedDetails {
    card: CardDetail;
    then: AfterSaving;
}

const LAST_LANGUAGE_KEY = 'last-card-language';
const LAST_CONDITION_KEY = 'last-card-condition';

function lastChoice<T extends string>(key: string, options: ReadonlyArray<T>): T | undefined {
    try {
        const stored = localStorage.getItem(key);

        return options.find((option) => option === stored);
    } catch {
        return undefined;
    }
}

function remember(key: string, value?: string): void {
    try {
        if (value) {
            localStorage.setItem(key, value);
        }
    } catch {
        return;
    }
}

@Component({
    selector: 'app-card-details',
    standalone: true,
    imports: [TranslatePipe, CandidateListComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="details">
            <h2 class="section-title !mt-0">{{ 'details.which' | translate }}</h2>
            @if (chosen(); as candidate) {
                <div class="chosen card flex items-center gap-3">
                    @if (candidate.image; as image) {
                        <img [src]="image + '/low.webp'" alt="" />
                    }
                    <span class="grow">
                        <span class="block font-semibold">{{ candidate.name }}</span>
                        <span class="muted block text-sm">{{ candidate.setName }} · {{ candidate.localId }}</span>
                    </span>
                    <button type="button" class="change btn" (click)="chosen.set(undefined)">{{ 'card.change' | translate }}</button>
                </div>
            } @else {
                <app-candidate-list [candidates]="results() ?? card().candidates" (chosen)="chosen.set($event)">
                    <p class="muted text-sm">{{ 'details.noCandidates' | translate }}</p>
                </app-candidate-list>
                <form class="mt-2 flex items-end gap-2" (submit)="$event.preventDefault(); search(name.value, number.value)">
                    <input #name class="field grow" type="search" autocomplete="off" [placeholder]="'card.searchName' | translate" [value]="card().reading?.name ?? ''" />
                    <input #number class="field !w-24" type="search" autocomplete="off" placeholder="4/102" [value]="card().reading?.number ?? ''" />
                    <button type="submit" class="search btn" [disabled]="searching()" [attr.aria-label]="'card.search' | translate">
                        <i class="material-symbols-outlined">search</i>
                    </button>
                </form>
            }

            <h2 class="section-title">{{ 'card.condition' | translate }}</h2>
            <div class="choices">
                @for (option of conditions; track option) {
                    <button type="button" class="choice condition" [class]="option" [class.on]="condition() === option" (click)="condition.set(condition() === option ? undefined : option)">
                        {{ 'conditionShort.' + option | translate }}
                    </button>
                }
            </div>

            <h2 class="section-title">{{ 'card.variant' | translate }}</h2>
            <div class="choices">
                @for (option of finishes; track option) {
                    <button type="button" class="choice finish" [class.on]="variant() === option" (click)="variant.set(variant() === option ? undefined : option)">
                        {{ 'variant.' + option | translate }}
                    </button>
                }
            </div>

            <h2 class="section-title">{{ 'card.language' | translate }}</h2>
            <div class="choices">
                @for (option of languages; track option) {
                    <button type="button" class="choice language" [class.on]="language() === option" (click)="language.set(language() === option ? undefined : option)">
                        {{ flag(option) }} {{ 'language.' + option | translate }}
                    </button>
                }
            </div>

            <div class="mt-5 flex flex-wrap gap-2">
                <button type="button" class="next btn keep grow" [disabled]="saving()" (click)="save('next')">
                    <i class="material-symbols-outlined">save</i>
                    {{ 'details.next' | translate }}
                </button>
                <button type="button" class="stop btn keep grow" [disabled]="saving()" (click)="save('stop')">
                    <i class="material-symbols-outlined">save</i>
                    {{ 'details.stop' | translate }}
                </button>
                <button type="button" class="discard btn grow" [disabled]="saving()" (click)="discard()">
                    <i class="material-symbols-outlined">delete</i>
                    {{ 'details.discard' | translate }}
                </button>
            </div>
        </div>
    `,
    styles: `
        .keep { border-color: var(--ok); background: var(--ok); color: var(--accent-text); }
        .discard { border-color: var(--danger); background: var(--danger); color: var(--accent-text); }
        .chosen img { width: 44px; aspect-ratio: 63 / 88; border-radius: 4px; object-fit: cover; }
        .choices { display: flex; flex-wrap: wrap; gap: 6px; }
        .choice { min-width: 44px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-size: 0.85rem; font-weight: 600; }
        .choice.on { border-color: var(--accent); background: var(--accent); color: var(--accent-text); }
        .condition.on.mint { border-color: var(--condition-mint); background: var(--condition-mint); color: var(--condition-text); }
        .condition.on.near_mint { border-color: var(--condition-near-mint); background: var(--condition-near-mint); color: var(--condition-text); }
        .condition.on.excellent { border-color: var(--condition-excellent); background: var(--condition-excellent); color: var(--condition-text); }
        .condition.on.good { border-color: var(--condition-good); background: var(--condition-good); color: var(--condition-text-dark); }
        .condition.on.light_played { border-color: var(--condition-light-played); background: var(--condition-light-played); color: var(--condition-text); }
        .condition.on.played { border-color: var(--condition-played); background: var(--condition-played); color: var(--condition-text); }
        .condition.on.poor { border-color: var(--condition-poor); background: var(--condition-poor); color: var(--condition-text); }
    `
})
export class CardDetailsComponent {
    public readonly card = input.required<CardDetail>();
    public readonly saved = output<SavedDetails>();
    public readonly failed = output<void>();
    public readonly discarded = output<number>();

    protected readonly conditions = CONDITIONS;
    protected readonly finishes = FINISHES;
    protected readonly languages = LANGUAGES;
    protected readonly chosen = linkedSignal<Candidate | undefined>(() => this.card().candidates[0]);
    protected readonly condition = linkedSignal<Condition | undefined>(() => this.card().condition ?? lastChoice(LAST_CONDITION_KEY, CONDITIONS));
    protected readonly variant = linkedSignal<Finish | undefined>(() => this.card().variant ?? 'normal');
    protected readonly language = linkedSignal<Language | undefined>(() => this.card().language ?? lastChoice(LAST_LANGUAGE_KEY, LANGUAGES));
    protected readonly results = signal<Array<Candidate> | undefined>(undefined);
    protected readonly searching = signal(false);
    protected readonly saving = signal(false);
    protected readonly flag = languageFlag;

    private readonly api = inject(ApiService);
    private readonly destroyRef = inject(DestroyRef);

    protected search(name: string, number: string): void {
        this.searching.set(true);
        this.api
            .searchCatalog(name, number)
            .pipe(
                tap((results) => this.results.set(results)),
                catchError(() => of(undefined)),
                finalize(() => this.searching.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    protected discard(): void {
        const id = this.card().id;
        this.saving.set(true);
        this.api
            .deleteCard(id)
            .pipe(
                tap(() => this.discarded.emit(id)),
                catchError(() => {
                    this.failed.emit();

                    return of(undefined);
                }),
                finalize(() => this.saving.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    protected save(then: AfterSaving): void {
        const id = this.card().id;
        const chosen = this.chosen();
        remember(LAST_LANGUAGE_KEY, this.language());
        remember(LAST_CONDITION_KEY, this.condition());
        this.saving.set(true);
        this.api
            .updateCard(id, { condition: this.condition() ?? null, variant: this.variant() ?? null, language: this.language() ?? null })
            .pipe(
                switchMap((card): Observable<CardDetail> => (chosen ? this.api.confirmCard(id, chosen.catalogCardId) : of(card))),
                tap((card) => this.saved.emit({ card, then })),
                catchError(() => {
                    this.failed.emit();

                    return of(undefined);
                }),
                finalize(() => this.saving.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }
}
