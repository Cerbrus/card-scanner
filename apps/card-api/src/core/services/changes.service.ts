import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class ChangesService {
    private readonly changes$ = new Subject<void>();

    public get changed$(): Observable<void> {
        return this.changes$.asObservable();
    }

    public notify(): void {
        this.changes$.next();
    }
}
