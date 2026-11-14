import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, filter, of, switchMap, tap, timer } from 'rxjs';

import { CardSummary } from '../models';
import { ApiService } from './api.service';

const POLL_MILLISECONDS = 3000;

@Injectable({ providedIn: 'root' })
export class CollectionStore {
    public readonly cards = signal<Array<CardSummary>>([]);
    public readonly loaded = signal(false);
    public readonly failed = signal(false);

    public readonly confirmed = computed(() => this.cards().filter((card) => card.status === 'confirmed'));
    public readonly inbox = computed(() => this.cards().filter((card) => card.status !== 'confirmed'));
    public readonly reading = computed(() => this.cards().some((card) => card.readingState === 'pending'));
    public readonly totalValue = computed(() => this.confirmed().reduce((total, card) => total + (card.estimatedValue ?? 0), 0));
    public readonly pricedCount = computed(() => this.confirmed().filter((card) => card.estimatedValue !== undefined).length);

    private readonly api = inject(ApiService);

    public refresh(): Observable<Array<CardSummary>> {
        return this.api.getCards().pipe(
            tap((cards) => {
                this.cards.set(cards);
                this.loaded.set(true);
                this.failed.set(false);
            }),
            catchError(() => {
                this.failed.set(true);

                return of(this.cards());
            })
        );
    }

    public followReadings(): Observable<Array<CardSummary>> {
        return timer(POLL_MILLISECONDS, POLL_MILLISECONDS).pipe(
            filter(() => this.reading() && !document.hidden),
            switchMap(() => this.refresh())
        );
    }

    public put(card: CardSummary): void {
        this.cards.update((cards) => (cards.some((known) => known.id === card.id) ? cards.map((known) => (known.id === card.id ? card : known)) : [card, ...cards]));
    }

    public drop(id: number): void {
        this.cards.update((cards) => cards.filter((card) => card.id !== id));
    }
}
