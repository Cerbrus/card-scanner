import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { catchError, exhaustMap, filter, of, tap, timer } from 'rxjs';

import { LogLine } from '../../models';
import { ApiService } from '../../services/api.service';

const POLL_MILLISECONDS = 5000;

@Component({
    selector: 'app-log-page',
    standalone: true,
    imports: [DatePipe, RouterLink, TranslateModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="page">
            <a class="back-bar" routerLink="/settings">
                <i class="material-symbols-outlined">arrow_back</i>
                {{ 'nav.settings' | translate }}
            </a>
            <h1 class="page-title">{{ 'log.title' | translate }}</h1>

            @if (failed()) {
                <p class="empty">{{ 'log.failed' | translate }}</p>
            } @else if (lines(); as lines) {
                <ol class="log card">
                    @for (line of lines; track line.id) {
                        <li class="line" [class]="line.level">
                            <span class="time">{{ line.time | date: 'd MMM HH:mm:ss' }}</span>
                            <span class="message">{{ line.message }}</span>
                        </li>
                    } @empty {
                        <li class="muted">{{ 'log.empty' | translate }}</li>
                    }
                </ol>
            } @else {
                <p class="empty">{{ 'common.loading' | translate }}</p>
            }
        </div>
    `,
    styles: `
        .log { display: flex; flex-direction: column-reverse; gap: 2px; padding: 10px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.74rem; }
        .line { display: flex; gap: 8px; white-space: pre-wrap; word-break: break-word; }
        .time { flex: 0 0 auto; color: var(--text-muted); }
        .message { flex: 1 1 auto; min-width: 0; }
        .warning .message { color: var(--warning-strong); }
        .error .message { color: var(--danger); }
        .debug .message { color: var(--text-muted); }
    `
})
export class LogPage {
    protected readonly lines = signal<Array<LogLine> | undefined>(undefined);
    protected readonly failed = signal(false);

    private readonly api = inject(ApiService);

    constructor() {
        timer(0, POLL_MILLISECONDS)
            .pipe(
                filter(() => !document.hidden),
                exhaustMap(() =>
                    this.api.getLogs().pipe(
                        tap((lines) => {
                            this.lines.set(lines);
                            this.failed.set(false);
                        }),
                        catchError(() => {
                            this.failed.set(this.lines() === undefined);

                            return of(undefined);
                        })
                    )
                ),
                takeUntilDestroyed()
            )
            .subscribe();
    }
}
