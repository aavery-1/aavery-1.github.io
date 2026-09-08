// Minimal typed declaration for rbush. The published package ships JS without
// bundled types in this version, so we declare the small surface we use.
declare module "rbush" {
  export interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  export default class RBush<T = BBox> {
    constructor(maxEntries?: number);
    insert(item: T): this;
    load(items: ReadonlyArray<T>): this;
    remove(item: T, equals?: (a: T, b: T) => boolean): this;
    clear(): this;
    search(bbox: BBox): T[];
    all(): T[];
  }
}
