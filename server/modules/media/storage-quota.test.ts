import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaLibraryLimit} from './storage-quota';
test('media storage stays bounded and invalid configuration never removes the cap',()=>{
 assert.equal(mediaLibraryLimit('1024'),1024**3);assert.equal(mediaLibraryLimit('2048'),2*1024**3);
 for(const value of ['','0','-1','NaN','999999','2048.5'])assert.equal(mediaLibraryLimit(value),1024**3);
});
