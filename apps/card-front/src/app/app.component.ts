import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { startWith, switchMap, tap } from 'rxjs';

import { LanguageService } from './services/language.service';
import { ThemeService } from './services/theme.service';
import { UpdateService } from './services/update.service';

@Component({
    standalone: true,
    imports: [RouterOutlet],
    selector: 'app-root',
    template: '<router-outlet />'
})
export class AppComponent {
    constructor() {
        const translate = inject(TranslateService);
        inject(ThemeService);
        inject(LanguageService).start();
        inject(UpdateService).start();

        translate.onLangChange
            .pipe(
                startWith(undefined),
                switchMap(() => translate.get('common.appName')),
                tap((appName: string) => {
                    document.title = appName;
                    document.documentElement.lang = translate.getCurrentLang() ?? 'nl';
                }),
                takeUntilDestroyed()
            )
            .subscribe();
    }
}
