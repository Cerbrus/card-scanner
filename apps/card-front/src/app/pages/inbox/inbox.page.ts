import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { cardState } from '../../components/card-tile/card-tile.component';
import { ApiService } from '../../services/api.service';
import { CollectionStore } from '../../services/collection.store';

@Component({
    selector: 'app-inbox-page',
    standalone: true,
    imports: [DatePipe, RouterLink, TranslateModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="page">
            <h1 class="page-title">{{ 'inbox.title' | translate }}</h1>
            <p class="muted mb-3 text-sm">{{ 'inbox.intro' | translate }}</p>

            <div class="flex flex-col gap-2">
                @for (card of store.inbox(); track card.id) {
                    <a class="card flex items-center gap-3" [routerLink]="['/cards', card.id]">
                        @if (card.photos.front; as front) {
                            <img class="h-20 w-14 shrink-0 rounded-md object-cover" [src]="api.photoUrl(front, true)" alt="" loading="lazy" />
                        }
                        <span class="min-w-0 grow">
                            <span class="block truncate font-semibold">{{ card.name ?? ('card.unknown' | translate) }}</span>
                            <span class="muted block truncate text-sm">{{ card.setName ?? '' }} {{ card.number ?? '' }}</span>
                            <span class="mt-1 flex items-center gap-2">
                                <span class="badge" [class.off]="state(card) === 'unknown'">{{ 'state.' + state(card) | translate }}</span>
                                <span class="muted text-xs">{{ card.createdAt | date: 'd MMM HH:mm' }}</span>
                            </span>
                        </span>
                        <i class="material-symbols-outlined muted">chevron_right</i>
                    </a>
                } @empty {
                    <p class="empty">{{ 'inbox.empty' | translate }}</p>
                }
            </div>
        </div>
    `
})
export class InboxPage {
    protected readonly store = inject(CollectionStore);
    protected readonly api = inject(ApiService);
    protected readonly state = cardState;
}
