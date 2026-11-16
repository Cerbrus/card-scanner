import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeStore, texts } from '../../../testing/fakes';
import { TranslateTesting } from '../../../testing/translate';
import { AuthService } from '../../services/auth.service';
import { CollectionStore } from '../../services/collection.store';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
    let fixture: ComponentFixture<ShellComponent>;
    const viewer = { value: false };

    const tabs = (): Array<string> => {
        fixture = TestBed.createComponent(ShellComponent);
        fixture.detectChanges();

        return texts(fixture.nativeElement as HTMLElement, '.tab span:last-child');
    };

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [TranslateTesting],
            providers: [provideRouter([]), { provide: CollectionStore, useValue: fakeStore() }, { provide: AuthService, useValue: { viewer: (): boolean => viewer.value } }]
        });
    });

    it('offers every tab to an account that may change the collection', () => {
        viewer.value = false;

        expect(tabs()).toEqual(['nav.collection', 'nav.scan', 'nav.help', 'nav.settings']);
    });

    it('leaves the scan tab out for an account that may only look', () => {
        viewer.value = true;

        expect(tabs()).toEqual(['nav.collection', 'nav.help', 'nav.settings']);
    });
});
