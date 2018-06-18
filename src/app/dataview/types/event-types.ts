import { EventEmitter } from '@angular/core';
import { LabelSchemeInfo, EventMap } from '../../data-loader/workspace-info';

// #region [Interfaces]
type LabelKey = number | string

type WeakScheme = {name: string}
// #endregion

export class EventTypeMap {
    // #region [Constants]
    NULL_LABEL = 'Ø'
    // #endregion

    // #region [Variables]
    name: string;
    null_label: LabelKey;
    private _emap: EventMap;
    private scheme: LabelSchemeInfo;
    // #endregion

    // #region [Constructor]
    constructor(scheme: WeakScheme)
    constructor(labelscheme: LabelSchemeInfo) {
        this.scheme = labelscheme;
        this.name = labelscheme.name;
        this._emap = labelscheme.event_map || {};
        this.null_label = labelscheme.null_label || 0;
    }
    // #endregion

    // #region [Accessors]
    get event_types() { return Object.keys(this._emap) }

    get labelscheme() { return this.scheme }
    // #endregion

    // #region [Public Methods]
    get(key: LabelKey) {
        // if null-label, return special string
        if (this.isNull(key)) return this.NULL_LABEL;
        // check if valid key
        key = this.toInt(key);
        if (!(key in this._emap)) { console.warn('unexpected label key:', key) }
        return this._emap[key];
    }
    // #endregion

    // #region [Utility Methods]
    isNull(key: LabelKey): boolean {
        return key == this.null_label
    }
    // #endregion

    // #region [Helper Methods]
    private toInt(key: LabelKey): number {
        if (typeof key === 'string') return parseInt(key);
        else return key;
    }
    // #endregion
}