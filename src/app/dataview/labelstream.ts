import { EventEmitter } from '@angular/core';

// #region [Interfaces]
export interface Label {
    start: number;
    end: number;
    label: number;
    type?: string;
    selected?: boolean;
    id?: number;
}

export interface EventMap {
    [index: number]: string;
}
// #endregion


export class LabelStream {
    // #region [Variables]
    name: string;
    labels: Label[];
    event: EventEmitter<string>;
    emap: EventMap;
    private _i: number;
    // #endregion

    // #region [Constructor]
    constructor(name:string, labels: Label[], emap: EventMap = {}) {
        this.name = name;
        this.labels = labels.map((lbl,i) => { lbl.id = i; return lbl} )
        this._i = this.labels.length;
        this.emap = emap;
        this.event = new EventEmitter<string>();
        this.event.emit('init');
    }
    // #endregion

    // #region [Public Methods]
    remove(lbl: Label) { 
        this.labels = this.labels.filter((l) => { return l.id !== lbl.id })
    }

    add(lbl: Label) {
        if (this.exists(lbl)) {console.warn('this label already exists', lbl); return; }
        lbl.id = this._i;
        this._i++;
        this.labels.push(lbl);
    }

    toJSON() {
        let simplify = (lbl) => {return {start: lbl.start, end: lbl.end, label: lbl.label} }
        let lbls = this.labels.map(simplify);
        lbls = this.sort(lbls);
        return JSON.stringify(lbls);
    }
    // #endregion

    // #region [Helper Methods]
    /**
     * Checks whether another label with the same start/end time already exists
     */
    private exists(lbl) {
        let idx = this.labels.findIndex((l) => {
            return l.start === lbl.start 
                && l.end   === lbl.end 
        })
        return (idx > -1)
    }

    /**
     * Sorts the labels by their start time
     */
    private sort(labels) {
        let compare = (a,b) => { return a.start - b.start }
        labels.sort(compare);
        return labels;
    }
    // #endregion
}