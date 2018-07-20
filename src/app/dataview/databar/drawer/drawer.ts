import { DatabarComponent } from '../databar.component';
import { Label } from '../../labelstreams/labelstream';
import * as d3 from "d3";
import { arraysEqual } from '../../../util/util';
import { Selection } from './selection.interface';
import { time_format } from './time-format';
import { LayerMap } from './layers';
import { DisplayMode } from '../../energy/energy-wells';
import { HighlightBehavior } from './behaviors/highlight';
import { DragBehavior } from './behaviors/drag';

// #region [Interfaces]

type side = 'left' | 'right'

type ZoomBehavior = any
type MouseBehavior = any
// #endregion

// #region [Constants]
const POINTER = 'M10,2A2,2 0 0,1 12,4V8.5C12,8.5 14,8.25 14,9.25C14,9.25 16,9 16,10C16,10 18,9.75 18,10.75C18,10.75 20,10.5 20,11.5V15C20,16 17,21 17,22H9C9,22 7,15 4,13C4,13 3,7 8,12V4A2,2 0 0,1 10,2Z'
const BRUSH = 'M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z'

const D3_EVENTS = ['zoom', 'drag', 'start', 'end']
// #endregion

export class Drawer {
  // #region [Variables]
  databar: DatabarComponent;
  layers: LayerMap;
  x; x0;
  xe; ye; ys;
  area; stacked_area;
  Y = [];
  lines = [];
  zoom: ZoomBehavior;
  mouse: MouseBehavior;
  div: Selection;
  particles = [];
  simulation;
  behaviors;
  // #endregion

  // #region [Private Variables]
  private z_start;
  private cursor;
  private pour_timer;
  // #endregion

  // #region [Constructor]
  constructor(databar: DatabarComponent) {
    this.databar = databar;
    // setup selection layers
    let host = d3.select(databar.element.nativeElement);
    this.layers = new LayerMap(host);
    this.layers.svg
        .attr('height', databar._height);
    this.layers.transform
        .attr("transform", "translate(" + databar.margin.left + "," + databar.margin.top + ")");
    this.layers.zoom
        .attr('width', databar.width)
        .attr('height', databar.height);
    this.layers.clip
        .attr('width', databar.width)
        .attr('height', databar.height);
    // setup behaviors
    this.behaviors = {};
    this.behaviors.highlight = new HighlightBehavior(this);
    this.behaviors.drag = new DragBehavior(this);
    this.zoom = this.setup_zoom();
    this.mouse = this.setup_mouse();
    // register non-local behaviors
    this.layers.svg.call(this.mouse);
    this.layers.svg.call(this.zoom)
                   .on("dblclick.zoom", null);
    // create tooltip div
    
  }
  // #endregion

  // #region [Accessors]
  get sensor() { return this.databar.sensor }

  get labels() { return this.databar.labels }

  get selected_label() { return this.databar.selected_label }

  get show_labels() { return this.databar.sensor.show_labels }

  get signals() { return this.layers.host.selectAll('g.signals > path.line') }

  get energyWells() { return this.layers.host.selectAll('g.energy > path.energy') }

  get w() { return this.databar.width }

  get h() { return this.databar.height }

  get mode() { return this.databar.mode }

  get labeller() { return this.databar.labeller }

  get label_type() { return this.ls.lbl_type }

  get ls() { return this.databar.labelstream }

  get mouse_event(): MouseEvent {
    let event = d3.event;
    if (D3_EVENTS.includes(event.type)) return event.sourceEvent;
    else return event;
  }

  get domain_set() { return this.x && !arraysEqual(this.x.domain(), [0, 1]) }

  get energy() { return this.databar.energy }
  // #endregion

  // #region [Callbacks]
  get key() { return (d,i) => { return d ? d.id : i } }

  get width() { return (d) => { return this.x(d.end) - this.x(d.start) } }

  get middle() { return (d) => { return this.x(d.start + (d.end-d.start)/2) }  }

  get fill() { return (d) =>  { return this.databar.colorer.labels(this.ls.name).get(d.label) } }
  // #endregion

  // #region [Data Loading]
  async stackedSeries() {
    let formatted = await this.energy.formatted;
    let stack = d3.stack()
                  .keys(this.energy.short_dims)
                  .order(d3.stackOrderAscending);
    return stack(formatted);
  }
  // #endregion

  // #region [Public Plotting Methods]
  async draw() {
    this.set_ranges();
    let data = await this.databar._data;
    this.set_domains(data);
    this.energy_domains();
    this.databar.stop_spinner();
    this.draw_xAxis();
    this.draw_yAxis();
    this.draw_energy();
    this.plot_signals(data);
    this.draw_labels();
    this.draw_handles();
  }
  
  draw_labels() {
    if (!this.labels) { return }
    if (!this.domain_set) { return }
    if (!this.show_labels) { this.clear('labels'); return; }
    
    let lbls = this.select_labels();
    this.exiting_labels(lbls);
    let enter = this.entering_labels(lbls);
  }
  
  draw_handles(lbl?: Label) {
    // erase handles if show-labels is false
    if (!this.selected_label) { this.clear('handles'); return; }
    if (!this.show_labels) { this.clear('handles'); return; }
    // if no label is selected, clear the handles and return
    if (!lbl) { lbl = this.selected_label as Label }
    if (!lbl) { this.clear('handles'); return; }
    // selections
    let left = this.layers.handles.selectAll('rect.drag-handle.left').data([lbl]);
    let right = this.layers.handles.selectAll('rect.drag-handle.right').data([lbl]);
    let both = this.layers.handles.selectAll('rect.drag-handle');
    // draw left/right handles
    left = this._add_handle(left, 'left');
    right = this._add_handle(right, 'right');
    // conditionally format if width == 0
    if (lbl.start === lbl.end) { both.classed('warn', true) }
    else { both.classed('warn', false) }
  }
  
  clear(...layers) {
    // if no parameters given, clear everything
    if (layers.length === 0) {
      for (let p of this.layers.primaries) { p.all.remove() }
    }
    else for (let l of layers) {
      let layer = this.layers.get(l);
      layer.all.remove();
    }
  }
  
  draw_xAxis() {
    this.layers.axes.append('g')
        .attr('class', 'x-axis')
        .attr('transform', 'translate(0,' + this.databar.height + ')')
        .call(d3.axisBottom(this.x)
                .tickFormat((d) => { return time_format(d) }));
  }

  draw_yAxis() {
    this.layers.axes.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(this.Y[0]));
    if (this.yDims().length > 1) {
      this.layers.axes.append('g')
        .attr('class', 'y-axis')
        .attr("transform", "translate( " +this.w + ", 0 )")
        .call(d3.axisRight(this.Y[1]));
    }
    if (this.energy.has_energy) {
      let y = this.eyAxis();
      this.layers.axes.append('g')
          .attr('class', 'y-axis')
          .attr("transform", "translate( " +this.w + ", 0 )")
          .call(d3.axisLeft(y));
    }
  }

  draw_cursor(cursor) {
    this.clear('cursor');
    if (!cursor) { return }
    // only draws cursor
    let [x,y] = this.xy();
    let selection = this.layers.cursor;
    selection.append('svg')
             .attr('class', 'cursor')
             .attr('width', 24)
             .attr('height', 24)
             .attr('x', x-12)
             .attr('y', y-12)
             .attr('viewBox', "0 0 24 24")
             .append('path')
             .attr('d', cursor);
  }

  async draw_energy() {
    if (!this.energy.has_energy) { return }
    if (!this.energy.visible) { this.clear('energy'); return; }
    if (this.energy.displayMode === DisplayMode.Stacked) {
      let series = await this.stackedSeries();
      this.plotStacked(series);
    }
    else if (this.energy.displayMode === DisplayMode.Overlayed) {
      let data = await this.energy.data;
      this.plotOverlayed(data);
    }
    
  }
  // #endregion

  // #region [Update Methods]
  updateSignals() {
    if (this.yDims().length === 1) {
      this.signals.attr("d", this.lines[0])
    }
    else for (let j of this.yDims()) {
      let dim_sigs = this.layers.host.selectAll('g.signals > path.line.line-' + j.toString());
      dim_sigs.attr("d", this.lines[j]);
    }
  }

  updateEnergy() {
    if (this.energy.displayMode === DisplayMode.Overlayed)
      this.energyWells.attr('d', this.area);
    else if (this.energy.displayMode === DisplayMode.Stacked)
      this.energyWells.attr('d', this.stacked_area);
  }

  updateLabels() {
    let width = (d) => { return this.x(d.end) - this.x(d.start) }
    this.layers.labels
        .selectAll('rect.label')
        .attr('x', (d) => { return this.x(d.start) })
        .attr('width', width)
  }
  // #endregion

  // #region [Signal Plotting Helpers]
  private async plot_signals(_data) {
    // downsample first
    _data = await Promise.resolve(_data);
    let data = this.databar.downsample(_data);
    // draw each signal
    for (let j = 0; j < data.length; j++) {
      this.plot_signal(data[j], j);
    }
  }
  
  private plot_signal(signal, j) {
    this.layers.signals.append("path")
        .datum(signal)
        .attr("fill", "none")
        .attr("clip-path", "url(#clip)")
        .attr("class", "line line-" + j.toString())
        .attr("stroke", this.databar.colorer.lines.get(j+1))
        .attr("idx", j)
        .attr("d", this.getLine(j))
        .on("mouseover", () => this.behaviors.highlight.mouseover(j))
        .on("mouseout", () => this.behaviors.highlight.mouseout())
  }
  // #endregion
  
  // #region [Drag Handle Plotting Helpers]
  private _add_handle(selection: Selection, side: 'left' | 'right') {
    let callback;
    if (side === 'left') callback = (d) => { return this.x(d.start) - 5 }
    else callback = (d) => { return this.x(d.end) - 5 }
    return selection.enter().append('rect')
                    .attr('width', 10)
                    .classed('drag-handle', true)
                    .classed(side, true)
                    .attr('y', 0)
                    .attr('height', this.databar.height)
                    .call(this.behaviors.drag.resize[side])
                    .merge(selection)
                    .attr('x', callback)
  }
  // #endregion

  // #region [Labels Plotting Helpers]
  private select_labels() {
    let rects = this.layers.labels
                    .selectAll('rect.label')
                    .data(this.labels, this.key)
                    .attr('x', (d) => { return this.x(d.start) })
                    .attr('width', this.width)
                    .attr('fill', this.fill)
                    .classed('selected', (d) => d.selected )
    return rects;
  }

  private exiting_labels(lbls) {
    lbls.exit()
        .transition()
        .duration(250)
        .attr('width', 0)
        .attr('x', this.middle)
        .remove();
  }

  private entering_labels(lbls) {
    let enter = lbls.enter()
                    .append('rect')
                    .attr('y', 0)
                    .attr('height', this.databar.height)
                    .attr("clip-path", "url(#clip)")
                    .classed('label', true)
                    .on('click', (d) => { this.lbl_clicked(d) })
                    .call(this.behaviors.drag.move)
                    .attr('x', this.middle)
                    .attr('width', 0)
                    .classed('selected', (d) => d.selected )
                    .attr('fill', this.fill)
    // add title pop-over
    enter.append('svg:title')
         .text((d) => {return d.type + ' event' || 'event ' + d.label.toString()})
    // transition
    enter.transition()
         .duration(250)
         .attr('x', (d) => { return this.x(d.start) })
         .attr('width', this.width)
    return enter;
  }
  // #endregion

  // #region [Energy Wells Plotting Helpers]
  private plotStacked(series) {
    // update selection
    let wells = this.layers.energy.selectAll('path').data(series)
    // exit selection
    wells.exit()
         .remove()
    // entering selection
    wells = wells.enter().append('path')
          .merge(wells)
          .attr('class', 'energy')
          .attr("clip-path", "url(#clip)")
          .attr('fill', (d,i) => this.databar.colorer.wells.get(i))
          .attr('d', this.stacked_area)
          .append('svg:title').text((d,i) => {return d.key})
  }

  private plotOverlayed(data) {
    console.debug('plotting overlayed', data);
    for (let j = 0; j < data.length; j++) {
      this.layers.energy.append('path')
                        .datum(data[j])
                        .attr('class', 'energy')
                        .attr('fill', this.databar.colorer.wells.get(j+1))
                        .attr("clip-path", "url(#clip)")
                        .attr('d', this.area);
    }
  }
  // #endregion

  // #region [Domains and Ranges]
  set_ranges() {
    // set x-ranges
    this.x = d3.scaleLinear().rangeRound([0, this.w]);
    this.x0 = d3.scaleLinear().rangeRound([0, this.w]);
    this.xe = d3.scaleLinear().rangeRound([0, this.w]);
    // set y-ranges
    for (let j of this.yDims()) {
      this.Y[j] = d3.scaleLinear().rangeRound([this.h, 0]);
    }
    this.ye = d3.scaleLog()
                .clamp(true)
                .rangeRound([0, this.h]);
    this.ys = d3.scaleLog()
                .clamp(true)
                .rangeRound([0, this.h]);
    // setup line-drawing method(s)
    for (let j of this.yDims()) {
      this.lines[j] = d3.line().x((d) => this.x(d.i))
                               .y((d) => this.Y[j](d.d))
    }
    // setup area-drawing method
    this.area = d3.area()
          .x((d) => this.xe(d.i))
          .y1((d) => this.ye(d.d+1));
    this.stacked_area = d3.area()
          .x((d) => this.xe(d.data.i))
          .y0((d) => this.ys(d[0]+1))
          .y1((d) => this.ys(d[1]+1));
  }

  set_domains(axes) {
    // setup x-domains
    let max = axes[0][axes[0].length-1].i;
    this.x.domain([0, max]);
    this.x0.domain(this.x.domain());
    // combined y-domains (default)
    if (this.yDims().length === 1) {
      this.Y[0].domain([d3.min(axes, (ax) => d3.min(ax, (d) => d.d)), 
                        d3.max(axes, (ax) => d3.max(ax, (d) => d.d))]);
    }
    // individual y-domains
    else for (let j of this.yDims()) {
      this.Y[j].domain([d3.min(axes[j], (d) => d.d), 
                        d3.max(axes[j], (d) => d.d)])
    }
  }

  async energy_domains() {
    if (!this.energy.has_energy) { return }
    // await data
    let axes = await this.energy.data;
    let series = await this.stackedSeries();
    // helper methods
    let imax = axes[0][axes[0].length-1].i;
    let seriesMax = (layer) => { return d3.max(layer, (d) => d[1]+1) };
    // set domains
    this.xe.domain([0, imax]);
    this.ye.domain([1, d3.max(axes, (ax) => d3.max(ax, (d) => d.d+1))]);
    this.ys.domain([1, d3.max(series, seriesMax)])

    this.area.y0(this.ye(0));
  }

  private yDims() {
    if (this.sensor.channel === 'B') return [0, 1];
    else return [0];
  }

  private getLine(j) {
    if (this.sensor.channel !== 'B') return this.lines[0];
    else return this.lines[j];
  }

  private eyAxis() {
    if (this.energy.displayMode === DisplayMode.Overlayed) return this.ye;
    else return this.ys;
  }
  // #endregion

  // #region [Utility Methods]
  region() {
    // get x,y
    let [x,y] = this.xy();
    // return region based on precedence
    if (x < 0) return 'y-axis';
    if (y < 0) return 'margin-top';
    if (x > this.w) return 'margin-right';
    if (y > this.h) return 'x-axis';
    return 'frame';
  }
  // #endregion

  // #region [Zoom Behaviors]
  setup_zoom() {
    return d3.zoom().scaleExtent([1, 50])
                    .translateExtent([[0, 0], [this.w, this.h]])
                    .extent([[0, 0], [this.w, this.h]])
                    .on('zoom', () => this.zoomed())
                    .on('start', () => this.zoom_start())
                    .on('end', () => this.zoom_end())
  }

  zoomed() {
    let region = this.region()
    let type = d3.event.sourceEvent.type;
    let mode = this.mode;
    // always allow scroll-wheel zooming
    if (type === 'wheel' && region === 'frame') this.emit_zoom()
    else if (type === 'mousemove') {
      // always allow panning on the x-axis
      if (region === 'x-axis') this.emit_zoom();
      else if (region === 'frame') {
        if (mode.selection) this.emit_zoom();    // allow frame-panning in selection mode
        if (mode.click) this.mouse_move();       // otherwise treat as a mouse-move
      }
    }
    else { console.warn('unexpected zoom-event type:', type, 'region:', region, 'mode:', mode.current) }
  }

  private emit_zoom() { this.databar.zoom.emit(d3.event) }

  private zoom_start() {
    this.z_start = Date.now();
  }

  private zoom_end() {
    if (this.mode.pour) { this.end_pour() }
    let Δt = Date.now() - this.z_start;
    this.z_start = undefined;
    // console.debug('zoom end:', Δt);
  }
  // #endregion

  // #region [Mouse Behaviors]
  setup_mouse() {
    let behavior = (selection) => {
      selection.on('mousemove', () => {this.mouse_move()})
      selection.on('mouseleave', () => {this.mouse_leave()})
      selection.on('mousedown', () => {this.mouse_down()})
      selection.on('mouseup', () => {this.mouse_up()})
    }
    return behavior;
  }

  private mouse_move() {
    // get the custom cursor path, or null if no custom cursor applies to this setting
    let overlaps = this.overlaps();
    let cursor = this.custom_cursor(this.region(), this.mode, overlaps);
    this.layers.svg.classed('custom-cursor', !!cursor);
    this.draw_cursor(cursor);
  }

  private mouse_leave() {
    this.layers.svg.classed('custom-cursor', false);
    this.clear('cursor');
    this.end_pour();
  }

  private mouse_down() {
    let buttons = this.mouse_event.buttons
    console.debug('mouse down', buttons);
    if ((buttons & 16) === 16) { this.forward_click() }
    if ((buttons & 8) === 8) { this.backward_click() }
    if ((buttons & 4) === 4) { this.middle_click() }
    if ((buttons & 2) === 2) { this.right_click() }
    if ((buttons & 1) === 1) { this.left_click() }
  }

  private mouse_up() {
    console.debug('mouse up', this.mouse_event.button);
    // prevent page-forward
    if (this.mouse_event.button === 4) {
      this.mouse_event.preventDefault();
    }
    // prevent page-backwards
    if (this.mouse_event.button === 3) {
      this.mouse_event.preventDefault();
    }
    // for pour behaviour
    if (this.mouse_event.button === 0) {
      this.end_pour();
    }
  }
  // #endregion

  // #region [Click Handlers]

  /** general click call-back bound to the SVG */
  clicked(event: MouseEvent) {
    if (this.overlaps(event)) { return }    // ignore clicks on labels
    this.labeller.deselect();               // deselect any selected labels
    // if label-creation mode, add an event
    if (this.mode.click) {
      let [x,y] = this.xy(event);
      this.labeller.add(x, this.label_type);
    }
  }

  /** click call-back for when a label has been clicked */
  lbl_clicked(lbl) {
    if (this.mode.selection) this.labeller.select(lbl)
    if (this.mode.click)     this.labeller.change_label(lbl, this.label_type)
  }

  /** call-back for pressing the middle scroll-wheel button */
  middle_click() {
    this.mode.cycle();    // cycle through mode
    this.mouse_move();    // redraw mouse
  }

  /** call-back for pressing the "page-forward" button on the mouse */
  forward_click() { this.ls.cycle() }

  /** call-back for pressing the "page-backward" button on the mouse */
  backward_click() { this.ls.cycleDown() }

  right_click() { }

  left_click() {
    if (this.mode.pour) {this.start_pour()}
  }
  // #endregion

  // #region [Pouring]
  async start_pour() {
    if (!this.energy.has_energy) return;
    let [x,y] = this.xy();
    this.pour_timer = d3.interval((t) => this.pour_tick(t, x), 100);
    let xt = (x) => this.x.invert(x);
    let formatted = await this.energy.formatted;
    let e = (x) => {return this.energy.atSycn(xt(x), formatted)}
    let ys = (x) => {return this.ys(e(x)) }
    const DX = 10;
    let roll = (x) => {
      let x0 = ys(x);
      let x1 = ys(x+DX);
      let x2 = ys(x-DX);
      let left = (x0-x2)/(DX*2)
      let right = (x0-x1)/(DX*2)
      return x+left-right;
    }

    let _label = this.label_type;
    let lbl = this.labeller.add(this.x(x), _label, 1);

    console.log('POURING', [x,y], ys(x), _label, lbl);
    this.simulation = d3.forceSimulation(this.particles)
        .force('collide', d3.forceCollide(5))
        .force('fall', d3.forceY((d) => {return ys(d.x) }))
        .force('roll', d3.forceX((d) => {return roll(d.x) }))
        .alphaDecay(0.001)
        .on('tick', () => this.ticked());

  }

  end_pour() {
    console.log('END POUR')
    if (this.pour_timer)
      this.pour_timer.stop();
    if (this.simulation)
      this.simulation.stop();
    // TODO: get bounding rect
  }

  pour_tick(t, x) {
    console.debug('pour', t, x);
    let point = {x, y: 0}
    let nodes = this.simulation.nodes();
    nodes.push(point);
    this.simulation.nodes(nodes);
    this.simulation.restart();
  }

  private ticked() {
    let u = this.layers.ghost.selectAll('circle').data(this.particles);
    u.enter()
      .append('circle')
      .attr('r', 2)
      .merge(u)
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y);
    u.exit().remove();
  }
  // #endregion

  // #region [Helper Methods]
  private xy(event?): number[] {
    if (event) return d3.clientPoint(this.layers.zoom.node(), event);
    else return d3.mouse(this.layers.zoom.node());
  }

  private overlaps(event?: MouseEvent): boolean {
    event = event || this.mouse_event;
    return d3.select(event.target).classed('label');
  }

  private custom_cursor(region, mode, overlaps) {
    if (region === 'frame' && mode.click && !overlaps) return POINTER;
    if (region === 'frame' && mode.click && overlaps) return BRUSH;
    else return null;
  }

  private domains_and_ranges() {
    let dr = (d) => {return [d.domain(), d.range()]}
    let ys = this.Y.map((y) => dr(y))
    return {x: dr(this.x), x0: dr(this.x0), Y: ys} 
  }

  logInfo() {
    console.groupCollapsed('drawer');
    console.log('domains/ranges', this.domains_and_ranges());
    console.log('layers:', this.layers);
    console.log('line(s):', this.lines);
    console.log('stacked series:', this.stackedSeries());
    console.log('drawer:', this);
    console.groupEnd();
  }
  // #endregion
}
