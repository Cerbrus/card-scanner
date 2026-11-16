import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CONDITIONS, FINISHES } from '../../models';

@Component({
    selector: 'app-help-page',
    standalone: true,
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="page">
            <h1 class="page-title">{{ 'help.title' | translate }}</h1>

            <h2 class="section-title">{{ 'card.condition' | translate }}</h2>
            <p class="muted mb-3 text-sm">{{ 'help.condition.intro' | translate }}</p>
            <dl class="card help-list">
                @for (condition of conditions; track condition) {
                    <div class="entry condition">
                        <dt>
                            <span class="pill" [class]="condition">{{ 'conditionShort.' + condition | translate }}</span>
                            {{ 'condition.' + condition | translate }}
                        </dt>
                        <dd>{{ 'help.condition.' + condition | translate }}</dd>
                    </div>
                }
            </dl>

            <h2 class="section-title">{{ 'card.variant' | translate }}</h2>
            <p class="muted mb-3 text-sm">{{ 'help.finish.intro' | translate }}</p>
            <dl class="card help-list">
                @for (finish of finishes; track finish) {
                    <div class="entry finish">
                        <dt>
                            <span class="star" [class]="finish">
                                <i class="material-symbols-outlined">{{ finish === 'normal' ? 'crop_portrait' : 'star' }}</i>
                            </span>
                            {{ 'variant.' + finish | translate }}
                        </dt>
                        <dd>{{ 'help.finish.' + finish | translate }}</dd>
                    </div>
                }
            </dl>
        </div>
    `,
    styles: `
        .help-list { display: flex; flex-direction: column; gap: 14px; }
        dt { display: flex; align-items: center; gap: 8px; font-weight: 700; }
        dt .pill { min-width: 28px; font-size: 0.72rem; line-height: 18px; }
        dd { margin: 4px 0 0; font-size: 0.88rem; line-height: 1.45; }
        .star { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: var(--finish-back); color: var(--finish-star); }
        .star i { font-size: 16px; font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20; }
        .star.reverse i { font-variation-settings: 'FILL' 0, 'wght' 600, 'GRAD' 0, 'opsz' 20; }
        .star.normal i { color: var(--mark-text); font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 20; }
    `
})
export class HelpPage {
    protected readonly conditions = CONDITIONS;
    protected readonly finishes = FINISHES;
}
