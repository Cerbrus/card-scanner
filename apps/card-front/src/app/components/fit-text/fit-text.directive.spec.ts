import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FitTextDirective } from './fit-text.directive';

const LETTER_WIDTH = 10;

@Component({
    standalone: true,
    imports: [FitTextDirective],
    template: `<p><span [appFitText]="text()"></span></p>`
})
class HostComponent {
    public readonly text = signal('Charizard');
}

describe('FitTextDirective', () => {
    let fixture: ComponentFixture<HostComponent>;
    let room = 0;
    const shown = (): string => (fixture.nativeElement as HTMLElement).querySelector('span')?.textContent ?? '';

    beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => room);
        vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return (this.textContent ?? '').length * LETTER_WIDTH;
        });
        fixture = TestBed.createComponent(HostComponent);
    });

    afterEach(() => vi.restoreAllMocks());

    it('shows the whole text when it fits', () => {
        room = 200;
        fixture.detectChanges();

        expect(shown()).toBe('Charizard');
    });

    it('cuts a text that does not fit and ends it with one dot, without a space before it', () => {
        room = 70;
        fixture.detectChanges();
        expect(shown()).toBe('Chariz.');

        fixture.componentInstance.text.set('Mr. Mime');
        fixture.detectChanges();
        expect(shown()).toBe('Mr. Mi.');

        room = 40;
        fixture.componentInstance.text.set('Mr. Mime');
        fixture.detectChanges();
        fixture.componentInstance.text.set('Mr. Mimes');
        fixture.detectChanges();
        expect(shown()).toBe('Mr.');
    });
});
