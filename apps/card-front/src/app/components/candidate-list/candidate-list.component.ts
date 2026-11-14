import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Candidate } from '../../models';

@Component({
    selector: 'app-candidate-list',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="flex flex-col gap-2">
            @for (candidate of candidates(); track candidate.catalogCardId) {
                <button type="button" class="candidate" (click)="chosen.emit(candidate)">
                    @if (candidate.image; as image) {
                        <img [src]="image + '/low.webp'" alt="" loading="lazy" />
                    }
                    <span class="grow text-left">
                        <span class="block font-semibold">{{ candidate.name }}</span>
                        <span class="muted block text-sm">{{ candidate.setName }} · {{ candidate.localId }}</span>
                    </span>
                    <i class="material-symbols-outlined">check</i>
                </button>
            } @empty {
                <ng-content />
            }
        </div>
    `,
    styles: `
        .candidate {
            display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px 6px 6px;
            border: 1px solid var(--line); border-radius: 10px; background: var(--page);
        }
        img { width: 44px; aspect-ratio: 63 / 88; border-radius: 4px; object-fit: cover; }
        i { color: var(--accent); }
    `
})
export class CandidateListComponent {
    public readonly candidates = input.required<Array<Candidate>>();
    public readonly chosen = output<Candidate>();
}
