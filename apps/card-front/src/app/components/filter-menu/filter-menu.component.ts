import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { Language } from '../../models';
import { UNKNOWN_MARK, languageFlag } from '../card-tile/card-tile.component';

export type FilterKind = 'set' | 'condition' | 'language' | 'finish';

export const UNKNOWN_OPTION = 'unknown';

const ICONS: Record<FilterKind, string> = {
    set: 'collections_bookmark',
    condition: 'verified',
    language: 'translate',
    finish: 'auto_awesome'
};

@Component({
    selector: 'app-filter-menu',
    standalone: true,
    imports: [NgTemplateOutlet, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '(document:click)': 'closeOutside($event)', '(document:keydown.escape)': 'open.set(false)' },
    template: `
        <button
            type="button"
            class="toggle"
            [class.active]="value() && !labelled()"
            [class.labelled]="labelled()"
            [attr.aria-label]="'collection.filter.' + kind() | translate"
            [attr.aria-expanded]="open()"
            [title]="'collection.filter.' + kind() | translate"
            (click)="open.set(!open())"
        >
            @if (value(); as chosen) {
                <ng-container *ngTemplateOutlet="mark; context: { $implicit: chosen }" />
                @if (kind() === 'set') {
                    <span class="set-name">{{ chosen === unknown ? ('collection.filter.unknown' | translate) : chosen }}</span>
                } @else if (labelled()) {
                    <span class="set-name">{{ text(chosen) | translate }}</span>
                }
            } @else {
                <i class="material-symbols-outlined">{{ icons[kind()] }}</i>
                @if (labelled()) {
                    <span class="set-name muted">{{ emptyLabel() ?? 'collection.filter.all.' + kind() | translate }}</span>
                }
            }
            <i class="material-symbols-outlined caret">arrow_drop_down</i>
        </button>
        @if (open()) {
            <div class="menu" role="listbox">
                <button type="button" class="option" role="option" [attr.aria-selected]="!value()" (click)="choose('')">
                    <i class="material-symbols-outlined">{{ icons[kind()] }}</i>
                    {{ emptyLabel() ?? 'collection.filter.all.' + kind() | translate }}
                </button>
                @for (option of options(); track option) {
                    <button type="button" class="option" role="option" [attr.data-value]="option" [attr.aria-selected]="option === value()" (click)="choose(option)">
                        <ng-container *ngTemplateOutlet="mark; context: { $implicit: option }" />
                        {{ text(option) | translate }}
                    </button>
                }
            </div>
        }

        <ng-template #mark let-option>
            @switch (kind()) {
                @case ('condition') {
                    <span class="pill" [class]="option">{{ option === unknown ? unknownMark : ('conditionShort.' + option | translate) }}</span>
                }
                @case ('language') {
                    <span class="flag">{{ flag(option) }}</span>
                }
                @case ('finish') {
                    <span class="finish" [class]="option">
                        @if (option === unknown) {
                            {{ unknownMark }}
                        } @else {
                            <i class="material-symbols-outlined">{{ option === 'normal' ? 'crop_portrait' : 'star' }}</i>
                        }
                    </span>
                }
                @default {
                    <i class="material-symbols-outlined">{{ icons.set }}</i>
                }
            }
        </ng-template>
    `,
    styles: `
        :host { position: relative; display: block; min-width: 0; }
        .toggle {
            display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; height: 38px; padding: 0 2px 0 8px;
            border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text);
        }
        .toggle.active { border-color: var(--accent); }
        .toggle.labelled { justify-content: flex-start; gap: 8px; height: 44px; padding-left: 10px; }
        .toggle.labelled .set-name { font-size: 0.95rem; font-weight: 400; }
        .toggle i { font-size: 20px; }
        .toggle .caret { margin-left: auto; color: var(--text-muted); }
        .set-name { min-width: 0; overflow: hidden; font-size: 0.78rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .menu {
            position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; display: flex; flex-direction: column; min-width: 180px; max-height: 60vh;
            padding: 4px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); box-shadow: 0 6px 20px var(--crop-shade);
        }
        :host:last-child .menu { right: 0; left: auto; }
        .option {
            display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 6px; background: none; color: var(--text);
            font-size: 0.85rem; text-align: left; white-space: nowrap;
        }
        .option[aria-selected='true'] { background: var(--accent); color: var(--accent-text); }
        .option i { font-size: 18px; }
        .flag { font-size: 1.05rem; line-height: 1; }
        .finish { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; border-radius: 50%; background: var(--finish-back); color: var(--finish-star); font-weight: 700; }
        .finish i { font-size: 15px; font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20; }
        .finish.reverse i { font-variation-settings: 'FILL' 0, 'wght' 600, 'GRAD' 0, 'opsz' 20; }
        .finish.normal i { color: var(--mark-text); font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 20; }
    `
})
export class FilterMenuComponent {
    public readonly kind = input.required<FilterKind>();
    public readonly options = input.required<ReadonlyArray<string>>();
    public readonly value = input('');
    public readonly emptyLabel = input<string>();
    public readonly labelled = input(false);
    public readonly chosen = output<string>();

    protected readonly open = signal(false);
    protected readonly icons = ICONS;
    protected readonly unknown = UNKNOWN_OPTION;
    protected readonly unknownMark = UNKNOWN_MARK;

    private readonly host = inject(ElementRef<HTMLElement>);

    protected choose(option: string): void {
        this.open.set(false);
        this.chosen.emit(option);
    }

    protected closeOutside(event: Event): void {
        if (this.open() && !(this.host.nativeElement as HTMLElement).contains(event.target as Node)) {
            this.open.set(false);
        }
    }

    protected flag(option: string): string {
        return option === UNKNOWN_OPTION ? UNKNOWN_MARK : languageFlag(option as Language);
    }

    protected text(option: string): string {
        if (option === UNKNOWN_OPTION) {
            return 'collection.filter.unknown';
        }
        const keys: Record<FilterKind, string> = { set: '', condition: 'condition.', language: 'language.', finish: 'variant.' };

        return keys[this.kind()] + option;
    }
}
