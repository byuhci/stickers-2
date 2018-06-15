import { Component, OnInit, Input } from '@angular/core';
import { Sensor } from '../sensor';
import { Colorer } from '../colorer';


// #region [Interfaces]
type LabelKey = number | string
// #endregion

@Component({
  selector: 'toolbox-types',
  templateUrl: 'types-toolbox.component.html',
  styles: [':host { padding-left: 20px; }']
})
export class TypesToolboxComponent implements OnInit {

  // #region [Variables]
  lbl: LabelKey;
  private _colors;
  // #endregion

  // #region [Inputs]
  @Input() sensor: Sensor;
  @Input() colorer: Colorer;
  // #endregion

  // #region [Constructors]
  constructor() { }

  ngOnInit() {
    console.groupCollapsed('types-toolbox init', this.sensor.name);
    // initial selected label-type
    this.lbl = this.event_types[0];
    console.debug('lbl:', this.lbl);
    console.info('types-toolbox initialized', this);
    console.groupEnd();
  }
  // #endregion

  // #region [Accessors]
  get colors() {
    if (this._colors === undefined) 
      this._colors = this.colorer.labels.entries.map((entry) => entry.key)
    return this._colors;
  }

  get eventMap() { return this.colorer.dataview.eventMap }

  get event_types(): string[] { return Object.keys(this.eventMap) }
  // #endregion

  // #region [Public Methods]
  style_color(label: number) {
    let c = this.colorer.labels.get(label);
    return {"background-color": c};
  }
  // #endregion

  // #region [Event Handlers]
  changed(event) {
    console.debug('label type change:', event);
  }
  // #endregion
}