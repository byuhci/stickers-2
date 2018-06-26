import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { DataInfo } from './workspace-info';
import { parse } from "tfjs-npy";
import * as tf from "@tensorflow/tfjs-core";
import * as d3 from "d3";
import * as math from 'mathjs';

// #region [Interfaces]
export abstract class Dataset {
  // properties
  axes: Axes;
  info: DataInfo;
  // constructor
  constructor(info: DataInfo) { this.info = info }
  // abstract methods
  abstract format(): SignalStream;
  abstract filter(idx: number[]): Dataset;
  // shared methods
  toDatum(): datum[][] {
    let toArray = (axis) => {
      return Array.from(axis).map((d,_i) => {
        let i = (_i * this.info.Hz);
        let t = new Date(i);
        return {d, i, t} 
      }) as datum[] 
    }
    return this.format().map(toArray)
  }
}

interface datum {
  d: number;
  i: number;
  t?: Date;
}

type Axes = Array<Axis>
type Axis = tf.Tensor | number[]
type SignalStream = (Float32Array | Int32Array | Uint8Array | number[])[]
type RawData = ArrayBuffer | string;
// #endregion

// #region [Helper Classes]
class TensorDataset extends Dataset {
  axes: Array<tf.Tensor>;
  constructor(axes: Array<tf.Tensor>, info: DataInfo) {
    super(info);
    this.axes = axes;
  }
  format() { return this.axes.map((axis) => axis.dataSync()) }
  filter(idx: number[]): Dataset {
    const newaxes = this.axes.filter((e,i) => idx.includes(i));
    return new TensorDataset(newaxes, this.info);
  }
}

class CSVDataset extends Dataset {
  axes: number[][];
  constructor(axes: number[][], info: DataInfo, transpose = true) {
    super(info);
    if (transpose) this.axes = math.transpose(axes); 
    else this.axes = axes;
  }
  format() { return this.axes }
  filter(idx: number[]): Dataset {
    const newaxes = this.axes.filter((e,i) => idx.includes(i));
    return new CSVDataset(newaxes, this.info, false);
  }
}
// #endregion


@Injectable()
export class DataloaderService {

  // #region [Constructors]
  private datasets: Map<String,Promise<Dataset>>;
  constructor(private http: HttpClient) { 
    this.datasets = new Map();
  }
  // #endregion

  // #region [Public Methods]
  loadDataset(data: DataInfo) {
    let uri = '/api/data/' + data.workspace + '/' + data.name;
    let options = this.getOptions(data.format);
    let result = this.http.get(uri, options).toPromise()
                     .then((d: RawData) => { return this.toDataset(d, data) });
    this.datasets.set(data.name, result);
    console.debug('LOADING DATASET', result, data, this);
    return this.datasets.get(data.name);
  }

  getSensorStreams(dataset: string, idx: number[]): Promise<Dataset> {
    console.debug('retrieving data', dataset, idx, this);
    return this.datasets.get(dataset)
                        .then((dataset) => dataset.filter(idx))
  }

  getLabels(dataset: string) {
    return this.datasets.get(dataset)
                        .then((ds) => ds.filter([ds.axes.length-1]))
                        .then((ds) => ds.format()[0])
  }

  getLabels2(dataset: string) {
    return this.datasets.get(dataset)
                        .then((ds) => ds.filter([ds.axes.length-1]))
                        .then((ds) => ds.toDatum()[0])
  }
  // #endregion

  // #region [Helper Methods]
  private toDataset(d: RawData, info: DataInfo): Dataset {
    let format = info.format;
    if (format === 'tensor') {
      let tensors = parse(d as ArrayBuffer);
      let axes = tf.split(tensors, tensors.shape[1], 1);
      return new TensorDataset(axes, info);
    }
    else if (format === 'csv') {
      let asNumber = (d: Array<string>) => { return d.map((di) => +di) };
      let axes = d3.csvParseRows(d, asNumber);
      return new CSVDataset(axes, info);
    }
    else throw new TypeError('unrecognized or unsupported format type: ' + format);
  }

  private getOptions(format: string): any {
    if (format === 'tensor') return { responseType: 'arraybuffer' }
    else if (format === 'csv') return { responseType: 'text' }
    else throw new TypeError('unrecognized or unsupported format type: ' + format);
  }
  // #endregion
}
