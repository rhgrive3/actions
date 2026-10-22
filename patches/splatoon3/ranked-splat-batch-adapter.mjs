export function adaptRankedSplatBatch(rel,code,once){
 if(rel!=='src/world/paint.js')return code;
 code="import { Level as RankedBatchLevel } from './level.js';\nimport { NativeLevel as RankedBatchNativeLevel } from '../../patches/native-stages/runtime/engine.mjs';\nimport { createSplatBatch, splatBatchBlocks } from '../../patches/splatoon3/runtime/ranked/splat-batch.mjs';\n"+code;
 code=once(code,'  splat(center, radius, team, opts = {}) {',`  withSplatBatch(run) {
    const previous = this._orderedSplatBatch;
    this._orderedSplatBatch = createSplatBatch(this, RankedBatchLevel.prototype.queryBlocks, RankedBatchNativeLevel.prototype.queryBlocksBand);
    try { return run(); }
    finally { this._orderedSplatBatch = previous; }
  }

  splat(center, radius, team, opts = {}) {`,'ordered ranked splat batch scope');
 const query='    const ids = this.level.queryBlocksBand ? this.level.queryBlocksBand(center.x - reach, center.z - reach, center.x + reach, center.z + reach, this._qb || (this._qb = []), center.y, reach, 0) : this.level.queryBlocks(center.x - reach, center.z - reach, center.x + reach, center.z + reach, this._qb || (this._qb = []));';
 code=once(code,query,'    const ids = this._orderedSplatBatch && splatBatchBlocks(this, opts.face, center, reach) || ('+query.slice('    const ids = '.length,-1)+');','ranked batch exact face broadphase');
 return code;
}
