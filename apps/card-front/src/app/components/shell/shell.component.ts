import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { concat } from 'rxjs';

import { CollectionStore } from '../../services/collection.store';
import { ToastService } from '../../services/toast.service';

interface NavLink {
    route: string;
    label: string;
    icon: string;
}

@Component({
    selector: 'app-shell',
    standalone: true,
    imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './shell.component.html',
    styleUrl: './shell.component.scss'
})
export class ShellComponent {
    protected readonly store = inject(CollectionStore);
    protected readonly toasts = inject(ToastService);
    protected readonly inboxCount = computed(() => this.store.inbox().length);

    protected readonly links: Array<NavLink> = [
        { route: '/collection', label: 'nav.collection', icon: 'style' },
        { route: '/scan', label: 'nav.scan', icon: 'photo_camera' },
        { route: '/inbox', label: 'nav.inbox', icon: 'inbox' },
        { route: '/settings', label: 'nav.settings', icon: 'settings' }
    ];

    constructor() {
        concat(this.store.refresh(), this.store.followReadings()).pipe(takeUntilDestroyed()).subscribe();
    }
}
