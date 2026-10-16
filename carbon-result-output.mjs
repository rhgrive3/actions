import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
export function requireCarbonResultPath(value){assert.equal(typeof value,'string','CARBON_RESULT_PATH required');assert(value.length&&path.isAbsolute(value)&&value.endsWith('.json'),'Absolute JSON result path required');return value;}
export function writeCarbonResult(file,summary){requireCarbonResultPath(file);assert(Array.isArray(summary)&&summary.length===4,'Four completed role summaries required');fs.writeFileSync(file,JSON.stringify(summary)+'\n',{flag:'wx'});}
