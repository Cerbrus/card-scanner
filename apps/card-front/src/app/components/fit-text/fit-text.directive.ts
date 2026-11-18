import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';

@Directive({
    selector: '[appFitText]',
    standalone: true
})
export class FitTextDirective {
    public readonly appFitText = input.required<string>();

    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    constructor() {
        effect(() => this.fit(this.appFitText()));
        if (typeof ResizeObserver !== 'undefined' && this.element.parentElement) {
            const observer = new ResizeObserver(() => this.fit(this.appFitText()));
            observer.observe(this.element.parentElement);
            inject(DestroyRef).onDestroy(() => observer.disconnect());
        }
    }

    private fit(text: string): void {
        this.element.textContent = text;
        for (let length = text.length - 1; length > 0 && this.element.scrollWidth > this.element.clientWidth; length--) {
            this.element.textContent = `${text.slice(0, length).replace(/[\s.]+$/, '')}.`;
        }
    }
}
