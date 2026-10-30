import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyReleaseDefaults} from '../release-profile.mjs';
import {installedPets} from '../pet-config.mjs';
test('P3R beta defaults select P3R and Gojo once, retaining explicit user choices',()=>{
 const root=mkdtempSync(join(tmpdir(),'sg-profile-'));writeFileSync(join(root,'release-profile.json'),JSON.stringify({schemaVersion:1,edition:'p3r-beta',defaultTheme:'lanxi',defaultPet:'gojo'}));
 const saved=new Map([['appearance',{font:'system'}]]),args={root,setting:(k,d)=>saved.get(k)??d,saveSetting:(k,v)=>saved.set(k,v)};
 applyReleaseDefaults(args);assert.equal(saved.get('appearance').pack,'lanxi');assert.equal(saved.get('appearance').petSkin,'gojo');assert.equal(saved.get('widgetMode'),'pet');
 saved.set('appearance',{pack:'classic',petSkin:'moli'});applyReleaseDefaults(args);assert.deepEqual(saved.get('appearance'),{pack:'classic',petSkin:'moli'});
 saved.delete('releaseDefaultsApplied');saved.set('widgetMode','off');applyReleaseDefaults(args);assert.deepEqual(saved.get('appearance'),{pack:'classic',petSkin:'moli'});assert.equal(saved.get('widgetMode'),'off');
});
test('only installed pet assets enter the available choices',()=>{
 const root=mkdtempSync(join(tmpdir(),'sg-installed-pets-'));mkdirSync(join(root,'public/pet-assets'),{recursive:true});writeFileSync(join(root,'public/pet-assets/gojo-sheet.png'),'fixture');writeFileSync(join(root,'public/pet-assets/shijian.png'),'fixture');assert.deepEqual(installedPets(root),['gojo','shijian']);
});
