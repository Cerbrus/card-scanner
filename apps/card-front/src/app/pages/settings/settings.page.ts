import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable, catchError, of, switchMap, tap } from 'rxjs';

import { SystemState } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CollectionStore } from '../../services/collection.store';
import { AppLanguage, LanguageService, SUPPORTED_LANGUAGES } from '../../services/language.service';
import { THEMES, Theme, ThemeService } from '../../services/theme.service';
import { ToastService } from '../../services/toast.service';

const GOOGLE_OUTCOMES = ['connected', 'failed', 'not_configured'];

@Component({
    selector: 'app-settings-page',
    standalone: true,
    imports: [DatePipe, RouterLink, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './settings.page.html'
})
export class SettingsPage {
    public readonly google = input<string | undefined>(undefined);

    protected readonly themes = THEMES;
    protected readonly appLanguages = SUPPORTED_LANGUAGES;
    protected readonly system = signal<SystemState | undefined>(undefined);
    protected readonly busy = signal(false);
    protected readonly api = inject(ApiService);
    protected readonly auth = inject(AuthService);
    protected readonly theme = inject(ThemeService);
    protected readonly language = inject(LanguageService);

    private readonly store = inject(CollectionStore);
    private readonly toasts = inject(ToastService);
    private readonly translate = inject(TranslateService);
    private readonly destroyRef = inject(DestroyRef);

    constructor() {
        this.run(this.api.getSystem());
    }

    protected googleOutcome(): string | undefined {
        const outcome = this.google();

        return outcome && GOOGLE_OUTCOMES.includes(outcome) ? `settings.google.outcome.${outcome}` : undefined;
    }

    protected useTheme(theme: string): void {
        this.theme.use(theme as Theme);
    }

    protected useLanguage(language: string): void {
        this.language.use(language as AppLanguage);
    }

    protected refreshCatalog(): void {
        this.run(this.api.refreshCatalog().pipe(switchMap(() => this.api.getSystem())), 'settings.catalog.started');
    }

    protected refreshPrices(): void {
        this.run(
            this.api.refreshPrices().pipe(
                switchMap(() => this.store.refresh()),
                switchMap(() => this.api.getSystem())
            ),
            'settings.prices.done'
        );
    }

    protected syncNow(): void {
        this.run(this.api.runSync().pipe(switchMap(() => this.api.getSystem())), 'settings.google.started');
    }

    protected disconnect(): void {
        this.run(this.api.disconnectGoogle().pipe(switchMap(() => this.api.getSystem())));
    }

    protected reload(): void {
        this.run(this.api.getSystem());
    }

    protected logout(): void {
        this.auth.logout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }

    private run(request: Observable<SystemState>, doneText?: string): void {
        this.busy.set(true);
        request
            .pipe(
                tap((system) => {
                    this.system.set(system);
                    this.busy.set(false);
                    if (doneText) {
                        this.toasts.show({ kind: 'ok', text: this.translate.instant(doneText) });
                    }
                }),
                catchError(() => {
                    this.busy.set(false);
                    this.toasts.show({ kind: 'error', text: this.translate.instant('common.failed') });

                    return of(undefined);
                }),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }
}
