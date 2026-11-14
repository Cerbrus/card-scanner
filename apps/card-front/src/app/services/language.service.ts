import { Injectable, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { merge } from 'rxjs';

export const SUPPORTED_LANGUAGES = ['nl', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'language';
const DEFAULT_LANGUAGE: AppLanguage = 'nl';

@Injectable({ providedIn: 'root' })
export class LanguageService {
    public readonly language = signal<AppLanguage>(this.stored());

    private readonly translate = inject(TranslateService);

    public readonly changed = toSignal(merge(this.translate.onLangChange, this.translate.onTranslationChange));

    public start(): void {
        this.translate.use(this.language());
    }

    public use(language: AppLanguage): void {
        this.language.set(language);
        localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
        this.translate.use(language);
    }

    private stored(): AppLanguage {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);

        return SUPPORTED_LANGUAGES.find((language) => language === stored) ?? DEFAULT_LANGUAGE;
    }
}
