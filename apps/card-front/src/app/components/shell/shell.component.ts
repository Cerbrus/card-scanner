import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { concat } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { CollectionStore } from '../../services/collection.store';
import { ToastService } from '../../services/toast.service';

interface NavLink {
    route: string;
    label: string;
    icon: string;
    editor?: boolean;
}

const LINKS: Array<NavLink> = [
    { route: '/collection', label: 'nav.collection', icon: 'style' },
    { route: '/scan', label: 'nav.scan', icon: 'photo_camera', editor: true },
    { route: '/help', label: 'nav.help', icon: 'help' },
    { route: '/settings', label: 'nav.settings', icon: 'settings' }
];

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

    protected readonly links = computed(() => LINKS.filter((link) => !link.editor || !this.auth.viewer()));

    private readonly auth = inject(AuthService);

    constructor() {
        concat(this.store.refresh(), this.store.followReadings()).pipe(takeUntilDestroyed()).subscribe();
    }
}
