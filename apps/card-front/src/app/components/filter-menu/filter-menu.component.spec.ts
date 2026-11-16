import { ComponentFixture, TestBed } from '@angular/core/testing';

import { click } from '../../../testing/fakes';
import { TranslateTesting } from '../../../testing/translate';
import { FilterMenuComponent } from './filter-menu.component';

describe('FilterMenuComponent', () => {
    let fixture: ComponentFixture<FilterMenuComponent>;
    let host: HTMLElement;

    const openAt = (left: number, width: number): HTMLElement => {
        host.getBoundingClientRect = (): DOMRect => ({ left, width, right: left + width }) as DOMRect;
        click(host, '.toggle');
        fixture.detectChanges();

        return host.querySelector('.menu') as HTMLElement;
    };

    beforeEach(() => {
        vi.stubGlobal('innerWidth', 360);
        TestBed.configureTestingModule({ imports: [TranslateTesting] });
        fixture = TestBed.createComponent(FilterMenuComponent);
        fixture.componentRef.setInput('kind', 'language');
        fixture.componentRef.setInput('options', ['en', 'nl']);
        fixture.detectChanges();
        host = fixture.nativeElement as HTMLElement;
    });

    afterEach(() => vi.unstubAllGlobals());

    it('opens to the right from the left half of the page, no wider than the room up to the page edge', () => {
        const menu = openAt(16, 77);

        expect(menu.classList.contains('end')).toBe(false);
        expect(menu.style.maxWidth).toBe('336px');
    });

    it('opens to the left from the right half of the page, so it stays on a narrow phone', () => {
        const menu = openAt(182, 77);

        expect(menu.classList.contains('end')).toBe(true);
        expect(menu.style.maxWidth).toBe('251px');
    });

    it('works from the keyboard: arrows walk the options, Escape closes and gives the focus back', async () => {
        document.body.append(host);
        const toggle = host.querySelector('.toggle') as HTMLElement;
        const press = (key: string): void => {
            document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
            fixture.detectChanges();
        };
        const focused = (): string => (document.activeElement?.textContent ?? '').replace(/\s+/g, ' ').trim();

        fixture.componentRef.setInput('value', 'nl');
        fixture.detectChanges();
        expect(toggle.getAttribute('aria-label')).toBe('collection.filter.language: language.nl');

        openAt(16, 77);
        await fixture.whenStable();
        expect(focused()).toBe('🇳🇱 language.nl');

        press('ArrowUp');
        expect(focused()).toBe('🇬🇧 language.en');
        press('Home');
        expect(focused()).toBe('translate collection.filter.all.language');
        press('ArrowUp');
        press('End');
        expect(focused()).toBe('🇳🇱 language.nl');

        press('Escape');
        expect(host.querySelector('.menu')).toBeNull();
        expect(document.activeElement).toBe(toggle);
        host.remove();
    });

    it('closes on a second tap and on a choice', () => {
        openAt(16, 77);
        click(host, '.toggle');
        fixture.detectChanges();
        expect(host.querySelector('.menu')).toBeNull();

        const chosen = vi.fn();
        fixture.componentInstance.chosen.subscribe(chosen);
        openAt(16, 77);
        click(host, '.option', 2);
        fixture.detectChanges();

        expect(chosen).toHaveBeenCalledWith('nl');
        expect(host.querySelector('.menu')).toBeNull();
    });
});
